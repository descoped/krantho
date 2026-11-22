import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix, relative, sep } from 'node:path'
import { type KranthoConfigInput, type MediaSection, resolveConfig } from '@krantho/config'
import type { ImageLookup } from '@krantho/core'
import type sharp from 'sharp'

type ImageSettings = MediaSection['image']
type SharpFn = typeof sharp

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

/** An image's own size and the widths it is copied at */
interface ManifestEntry {
  width: number
  height: number
  widths: number[]
}

/** The copies written, by the image's path under the public folder (`/images/a.png`) */
interface Manifest {
  /** The settings the copies were made with: other settings remake them */
  stamp: string
  images: Record<string, ManifestEntry>
}

/** Options for {@link prepareImages} */
export interface PrepareImagesOptions {
  /** The site's configuration, as `krantho.config.ts` exports it; `media.image` sets widths and quality */
  config: KranthoConfigInput
  /** The folder the site serves as its root, `public/` by default */
  publicDir?: string | undefined
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
 * The widths an image is copied at: the server's presets (`media.image.presets`)
 * narrower than the image, and the full width, capped at `media.image.maxWidth`
 */
export function copyWidths(width: number, settings: ImageSettings): number[] {
  const full = Math.min(width, settings.maxWidth)
  const presets = Object.values(settings.presets).filter(
    (preset): preset is number => typeof preset === 'number' && preset < full,
  )
  return [...new Set([...presets, full])].sort((a, b) => a - b)
}

/** The settings that shape the copies, as one value */
function stampOf(settings: ImageSettings): string {
  const shape = {
    maxWidth: settings.maxWidth,
    presets: settings.presets,
    avif: settings.quality.avif,
    webp: settings.quality.webp,
  }
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 12)
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

function readManifest(publicDir: string): Manifest | undefined {
  const file = join(publicDir, COPIES, MANIFEST)
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Manifest
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

/** Whether a copy exists and is newer than its source */
async function upToDate(copy: string, sourceTime: number): Promise<boolean> {
  try {
    return (await stat(copy)).mtimeMs >= sourceTime
  } catch {
    return false
  }
}

async function copyImage(
  sharpFn: SharpFn,
  publicDir: string,
  image: string,
  settings: ImageSettings,
  remake: boolean,
): Promise<{ entry: ManifestEntry | undefined; copies: string[]; written: number }> {
  const file = join(publicDir, image.slice(1))
  const bytes = await readFile(file)
  const meta = await sharpFn(bytes).metadata()
  // EXIF orientation 5–8 turns the image a quarter: its shown width is its height
  const turned = (meta.orientation ?? 1) >= 5
  const width = turned ? meta.height : meta.width
  const height = turned ? meta.width : meta.height
  if (!width || !height) return { entry: undefined, copies: [], written: 0 }

  const widths = copyWidths(width, settings)
  const sourceTime = (await stat(file)).mtimeMs
  const copies: string[] = []
  let written = 0
  for (const copyWidth of widths) {
    for (const format of FORMATS) {
      const path = copyPath(image, copyWidth, format.ext)
      const target = join(publicDir, path)
      copies.push(path)
      if (!remake && (await upToDate(target, sourceTime))) continue
      const resized = sharpFn(bytes).rotate().resize({ width: copyWidth, withoutEnlargement: true })
      const encoded =
        format.ext === 'avif'
          ? resized.avif({ quality: settings.quality.avif })
          : resized.webp({ quality: settings.quality.webp })
      await writeWhole(target, await encoded.toBuffer())
      written++
    }
  }
  return { entry: { width, height, widths }, copies, written }
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
 * Copy each image in the site's public folder to AVIF and WebP at the widths
 * the server's image pipeline serves (`media.image.presets`, and the full
 * width capped at `media.image.maxWidth`), at `media.image.quality`. The copies
 * and their manifest go to `public/_krantho/images/`; `createStaticSite()`
 * reads the manifest, and each markdown image with copies renders as a
 * `<picture>`. A copy is remade when its image changes or the settings do.
 * Run it before the build: the template calls it from `next.config.ts`.
 */
export async function prepareImages(options: PrepareImagesOptions): Promise<PreparedImages> {
  const settings = resolveConfig(options.config, process.env).media.image
  const publicDir = publicDirOf(options.publicDir)
  const images = await sourceImages(publicDir)
  const stamp = stampOf(settings)
  const previous = readManifest(publicDir)
  const remake = previous?.stamp !== stamp

  const manifest: Manifest = { stamp, images: {} }
  const keep = new Set<string>()
  let written = 0
  if (images.length > 0) {
    const sharpFn = (await import('sharp')).default
    for (const image of images) {
      const result = await copyImage(sharpFn, publicDir, image, settings, remake)
      if (result.entry) manifest.images[image] = result.entry
      for (const copy of result.copies) keep.add(copy)
      written += result.written
    }
  }
  await removeStale(publicDir, keep)

  if (images.length === 0 && !previous) return { images: 0, written: 0 }
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
    return decodeURI(path.split(/[?#]/, 1)[0] ?? path)
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
