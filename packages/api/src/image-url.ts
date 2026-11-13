import { createHash } from 'node:crypto'
import type { MediaItem } from '@krantho/persistence'
import type { ImageFormat, ImagePreset } from './image-presets.js'
import { clampToPreset, parseFormat, parsePreset } from './image-presets.js'

/** One concrete rendition of a media item: every choice made, nothing negotiated */
export interface ImageVariant {
  preset: ImagePreset
  /** `original` serves the stored bytes unchanged (SVG without a raster format) */
  format: ImageFormat | 'original'
  aspect: string | undefined
}

const SVG = 'image/svg+xml'
const FORMATS = new Set<string>(['webp', 'jpeg', 'png', 'avif'])
/** Only N:N ratios, so arbitrary values cannot flood the variant cache */
const ASPECT_PATTERN = /^\d+:\d+$/

/**
 * The item's image revision: changes when the bytes or their framing change
 * (a replace gives a new url; crop and hotspot reshape every variant), and
 * stays put for alt text, tags, folder and rename edits.
 */
export function imageRevision(item: MediaItem): string {
  const source = `${item.url}|${JSON.stringify(item.crop)}|${JSON.stringify(item.hotspot)}`
  return createHash('sha256').update(source).digest('hex').slice(0, 12)
}

/**
 * Resolve a request's variant: `w` maps to a preset, `fmt` is explicit or
 * negotiated from `Accept`, and an SVG without an explicit raster format is
 * served as the original.
 */
export function resolveVariant(
  item: MediaItem,
  query: Record<string, string | undefined>,
  headers?: Record<string, string> | undefined,
): ImageVariant {
  const rawAspect = query.aspect
  const aspect = rawAspect && ASPECT_PATTERN.test(rawAspect) ? rawAspect : undefined
  return { preset: resolvePreset(query), format: resolveFormat(item, query, headers), aspect }
}

/** The versioned, immutable URL of a variant at a revision */
export function variantUrl(id: string, variant: ImageVariant, rev: string): string {
  const aspect = variant.aspect ? `&aspect=${variant.aspect}` : ''
  return `/api/media/${encodeURIComponent(id)}/image?preset=${variant.preset}&fmt=${variant.format}${aspect}&rev=${rev}`
}

/** The in-memory cache key of a rendered variant; a new revision never hits an old entry */
export function variantCacheKey(id: string, variant: ImageVariant, rev: string): string {
  return `${id}/${rev}/${variant.preset}/${variant.format}/${variant.aspect ?? ''}`
}

function resolvePreset(query: Record<string, string | undefined>): ImagePreset {
  const rawW = query.w
  const width = rawW ? Number.parseInt(rawW, 10) : Number.NaN
  return Number.isNaN(width) ? parsePreset(query.preset) : clampToPreset(width)
}

function resolveFormat(
  item: MediaItem,
  query: Record<string, string | undefined>,
  headers: Record<string, string> | undefined,
): ImageFormat | 'original' {
  const fmt = query.fmt
  const explicitRaster = fmt !== undefined && FORMATS.has(fmt)
  if (item.mimeType === SVG && !explicitRaster) return 'original'
  return parseFormat(fmt, headers?.accept)
}
