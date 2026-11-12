/** Image size presets — fixed classes, not arbitrary dimensions */
export type ImagePreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'

/** Supported output formats */
export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif'

const PRESET_NAMES = new Set<string>(['xs', 'sm', 'md', 'lg', 'xl', 'full'])
const FORMAT_NAMES = new Set<string>(['webp', 'jpeg', 'png', 'avif'])

const FORMAT_CONTENT_TYPES: Record<ImageFormat, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
  avif: 'image/avif',
}

/** Parse and validate a preset string. Returns 'md' as default. */
export function parsePreset(value: string | undefined): ImagePreset {
  if (value && PRESET_NAMES.has(value)) return value as ImagePreset
  return 'md'
}

/** Parse and validate a format string. Negotiates from Accept header if not explicit. */
export function parseFormat(
  value: string | undefined,
  acceptHeader: string | undefined,
): ImageFormat {
  if (value && FORMAT_NAMES.has(value)) return value as ImageFormat

  // Negotiate from Accept header — prefer AVIF (smallest), then WebP
  if (acceptHeader) {
    if (acceptHeader.includes('image/avif')) return 'avif'
    if (acceptHeader.includes('image/webp')) return 'webp'
    if (acceptHeader.includes('image/png')) return 'png'
  }

  return 'avif' // default — best compression
}

/** Get the content type for a format */
export function getContentType(format: ImageFormat): string {
  return FORMAT_CONTENT_TYPES[format]
}

/**
 * Clamp an arbitrary pixel width to the nearest preset.
 *
 * 0–64 → xs, 65–160 → sm, 161–384 → md, 385–768 → lg, 769+ → xl
 */
export function clampToPreset(width: number): ImagePreset {
  if (width <= 64) return 'xs'
  if (width <= 160) return 'sm'
  if (width <= 384) return 'md'
  if (width <= 768) return 'lg'
  return 'xl'
}
