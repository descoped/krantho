import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix, relative, sep } from 'node:path'
import { type KranthoConfigInput, resolveConfig } from '@krantho/config'
import type { ImageLookup } from '@krantho/core'
import type sharp from 'sharp'

type SharpFn = typeof sharp

/**
 * The widths a static site's images are copied at: about 1.2–1.5× apart, from
 * a phone in portrait to a content column on a 2× laptop or desktop screen.
 * The server's `media.image.presets` are its own and do not apply here.
 */
export const STATIC_IMAGE_WIDTHS: readonly number[] = [
  320, 480, 640, 750, 828, 1080, 1200, 1536, 1920, 2048,
]

/** Where the copies are written, under the public folder */
const COPIES = '_krantho/images'
const MANIFEST = 'manifest.json'
/** The formats each image is copied to, in the order the browser tries them */
const FORMATS = [
  { ext: 'avif', type: 'image/avif' },
  { ext: 'webp', type: 'image/webp' },
] as const
/** The images that are copied; SVG and GIF are served as they are */
const SOURCE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp'])

/** An image's own size, the widths it is copied at, and the content they were made from */
interface ManifestEntry {
  width: number
  height: number
  widths: number[]
  /**
   * A hash of the source's bytes. Its content, not its modification time,
   * decides: a fresh checkout in CI with the copies restored from a cache
   * reuses them.
   */
  hash: string
}

/** What shapes the copies: the widths and the quality per format */
interface CopySettings {
  widths: readonly number[]
  avif: number
  webp: number
}

/** The copies written, by the image's path under the public folder (`/images/a.png`) */
interface Manifest {
  /** The settings the copies were made with: other settings remake them */
  stamp: string
  images: Record<string, ManifestEntry>
}

/** Options for {@link prepareImages} */
export interface PrepareImagesOptions {
  /** The site's configuration, as `krantho.config.ts` exports it; `media.image.quality` sets the quality */
  config: KranthoConfigInput
  /** The folder the site serves as its root, `public/` by default */
  publicDir?: string | undefined
  /** The widths to copy at, instead of {@link STATIC_IMAGE_WIDTHS} */
  widths?: readonly number[] | undefined
}

/** What {@link prepareImages} did */
export interface PreparedImages {
  /** The images found in the public folder */
  images: number
  /** The copies written; unchanged copies are kept */
  written: number
}

/** The folder a site serves as its root */
function publicDirOf(publicDir: string | undefined): string {
  return publicDir ?? join(process.cwd(), 'public')
}

/**
 * The widths an image is copied at: those of the list narrower than the image,
 * and its own width, capped at the widest of the list
 */
export function copyWidths(
  width: number,
  widths: readonly number[] = STATIC_IMAGE_WIDTHS,
): number[] {
  const full = Math.min(width, Math.max(...widths))
  return [...new Set([...widths.filter((each) => each < full), full])].sort((a, b) => a - b)
}

/** The widths a site asked for, checked: positive whole numbers, at least one */
function widthsOf(widths: readonly number[] | undefined): readonly number[] {
  if (widths === undefined) return STATIC_IMAGE_WIDTHS
  if (widths.length === 0 || !widths.every((width) => Number.isInteger(width) && width > 0)) {
    throw new Error(
      `prepareImages: widths must be positive whole numbers, got ${JSON.stringify(widths)}`,
    )
  }
  return widths
}

/** The settings that shape the copies, as one value */
function stampOf(settings: CopySettings): string {
  return createHash('sha256').update(JSON.stringify(settings)).digest('hex').slice(0, 12)
}

/** The path of a copy under the public folder, without the leading slash */
function copyPath(image: string, width: number, ext: string): string {
  const withoutExt = image.slice(1, image.length - extname(image).length)
  return `${COPIES}/${withoutExt}-${width}.${ext}`
}

async function sourceImages(publicDir: string): Promise<string[]> {
  if (!existsSync(publicDir)) return []
  const entries = await readdir(publicDir, { recursive: true, withFileTypes: true })
  const images: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_TYPES.has(extname(entry.name).toLowerCase())) continue
    const path = relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join(posix.sep)
    if (!path.startsWith(`${COPIES}/`)) images.push(`/${path}`)
  }
  return images.sort()
}

function isEntry(value: unknown): value is ManifestEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.width === 'number' &&
    typeof entry.height === 'number' &&
    typeof entry.hash === 'string' &&
    Array.isArray(entry.widths) &&
    entry.widths.every((width) => typeof width === 'number')
  )
}

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null) return false
  const manifest = value as Record<string, unknown>
  const images = manifest.images
  return (
    typeof manifest.stamp === 'string' &&
    typeof images === 'object' &&
    images !== null &&
    Object.values(images).every(isEntry)
  )
}

/** The manifest, or undefined when there is none or it is not one this version wrote */
function readManifest(publicDir: string): Manifest | undefined {
  const file = join(publicDir, COPIES, MANIFEST)
  if (!existsSync(file)) return undefined
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return isManifest(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Write a file whole: a build that reads it meanwhile sees the old one or the new one */
async function writeWhole(file: string, data: Uint8Array | string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, data)
  await rename(temporary, file)
}

/** Every copy of an image, by format and width */
function copiesOf(image: string, widths: readonly number[]): string[] {
  return widths.flatMap((width) => FORMATS.map((format) => copyPath(image, width, format.ext)))
}

/** The previous entry, when the image's content is the same and every copy is still there */
function unchanged(
  previous: ManifestEntry | undefined,
  hash: string,
  publicDir: string,
  image: string,
): ManifestEntry | undefined {
  if (previous?.hash !== hash) return undefined
  const present = copiesOf(image, previous.widths).every((copy) =>
    existsSync(join(publicDir, copy)),
  )
  return present ? previous : undefined
}

interface CopyResult {
  entry: ManifestEntry | undefined
  copies: string[]
  written: number
}

async function copyImage(
  sharpFn: SharpFn,
  publicDir: string,
  image: string,
  settings: CopySettings,
  previous: ManifestEntry | undefined,
): Promise<CopyResult> {
  const bytes = await readFile(join(publicDir, image.slice(1)))
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const kept = unchanged(previous, hash, publicDir, image)
  if (kept) return { entry: kept, copies: copiesOf(image, kept.widths), written: 0 }

  try {
    return await encodeCopies(sharpFn, bytes, hash, publicDir, image, settings, previous)
  } catch (error) {
    // A file sharp cannot read is served as it is; it does not stop the build
    console.warn(
      `[krantho] ${image} is served as it is: its copies could not be made (${String(error)})`,
    )
    return { entry: undefined, copies: [], written: 0 }
  }
}

async function encodeCopies(
  sharpFn: SharpFn,
  bytes: Buffer,
  hash: string,
  publicDir: string,
  image: string,
  settings: CopySettings,
  previous: ManifestEntry | undefined,
): Promise<CopyResult> {
  // Decoded once; each copy is a clone of the oriented image
  const same = previous?.hash === hash
  const oriented = sharpFn(bytes).rotate()
  // The size as shown: an EXIF orientation that turns the image a quarter swaps width and height
  const { width, height } = (await oriented.metadata()).autoOrient

  const widths = copyWidths(width, settings.widths)
  let written = 0
  for (const copyWidth of widths) {
    for (const format of FORMATS) {
      const target = join(publicDir, copyPath(image, copyWidth, format.ext))
      // A copy of the same content is kept; only the missing ones are made
      if (same && existsSync(target)) continue
      const resized = oriented.clone().resize({ width: copyWidth, withoutEnlargement: true })
      const encoded =
        format.ext === 'avif'
          ? resized.avif({ quality: settings.avif })
          : resized.webp({ quality: settings.webp })
      await writeWhole(target, await encoded.toBuffer())
      written++
    }
  }
  return { entry: { width, height, widths, hash }, copies: copiesOf(image, widths), written }
}

/** Remove the copies no image needs any more: of a deleted image, or at a width no longer used */
async function removeStale(publicDir: string, keep: ReadonlySet<string>): Promise<void> {
  const root = join(publicDir, COPIES)
  if (!existsSync(root)) return
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = `${COPIES}/${relative(root, join(entry.parentPath, entry.name)).split(sep).join(posix.sep)}`
    if (path !== `${COPIES}/${MANIFEST}` && !keep.has(path)) await rm(join(publicDir, path))
  }
}

/**
 * Copy each image in the site's public folder to AVIF and WebP at
 * {@link STATIC_IMAGE_WIDTHS} (or `widths`), at `media.image.quality`. The
 * copies and their manifest go to `public/_krantho/images/`;
 * `createStaticSite()` reads the manifest, and each markdown image with copies
 * renders as a `<picture>`. An image whose content is unchanged keeps its
 * copies, also after a fresh checkout that restores them from a cache; they
 * are remade when it changes or the widths or quality do. Run it before the
 * build: the template calls it from `next.config.ts`.
 */
export async function prepareImages(options: PrepareImagesOptions): Promise<PreparedImages> {
  const quality = resolveConfig(options.config, process.env).media.image.quality
  const settings = { widths: widthsOf(options.widths), avif: quality.avif, webp: quality.webp }
  const publicDir = publicDirOf(options.publicDir)
  const images = await sourceImages(publicDir)
  const stamp = stampOf(settings)
  const previous = readManifest(publicDir)
  const reuse = previous?.stamp === stamp ? previous : undefined

  const manifest: Manifest = { stamp, images: {} }
  const keep = new Set<string>()
  let written = 0
  if (images.length > 0) {
    const sharpFn = (await import('sharp')).default
    for (const image of images) {
      const result = await copyImage(sharpFn, publicDir, image, settings, reuse?.images[image])
      if (result.entry) manifest.images[image] = result.entry
      for (const copy of result.copies) keep.add(copy)
      written += result.written
    }
  }
  await removeStale(publicDir, keep)

  // The manifest is written even without images: the folder then exists for a CI cache to save
  if (!existsSync(publicDir)) return { images: 0, written: 0 }
  if (JSON.stringify(previous) !== JSON.stringify(manifest)) {
    await writeWhole(join(publicDir, COPIES, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  if (written > 0) {
    const noun = images.length === 1 ? 'image' : 'images'
    console.log(
      `[krantho] ${written} copies of ${images.length} ${noun} written to public/${COPIES}`,
    )
  }
  return { images: images.length, written }
}

/** Options for {@link imageLookup} */
export interface ImageLookupOptions {
  /** The folder the site serves as its root, `public/` by default */
  publicDir?: string | undefined
  /** The path the site is served under; rendered image URLs start with it */
  basePath: string
  /** How wide images are shown, for the browser to pick a copy: `100vw` by default */
  sizes?: string | undefined
}

/** A rendered `src` as the path of the image under the public folder */
function imagePathOf(src: string, basePath: string): string | undefined {
  const path = basePath && src.startsWith(`${basePath}/`) ? src.slice(basePath.length) : src
  if (!path.startsWith('/') || path.startsWith('//')) return undefined
  try {
    return decodeURI(path.replace(/[?#].*$/s, ''))
  } catch {
    return undefined
  }
}

/**
 * The copies {@link prepareImages} wrote, by rendered `src`, or undefined when
 * there is no manifest (the images are then served as they are)
 */
export function imageLookup(options: ImageLookupOptions): ImageLookup | undefined {
  const manifest = readManifest(publicDirOf(options.publicDir))
  if (!manifest) return undefined
  const { basePath } = options
  const sizes = options.sizes ?? '100vw'
  return (src) => {
    const image = imagePathOf(src, basePath)
    const entry = image ? manifest.images[image] : undefined
    if (!image || !entry) return undefined
    const sources = FORMATS.map((format) => ({
      type: format.type,
      srcset: entry.widths
        .map(
          (width) => `${encodeURI(`${basePath}/${copyPath(image, width, format.ext)}`)} ${width}w`,
        )
        .join(', '),
    }))
    return { width: entry.width, height: entry.height, sources, sizes }
  }
}
