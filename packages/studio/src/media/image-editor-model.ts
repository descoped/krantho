import type { MediaCrop, MediaHotspot } from '../lib/api-types.js'

/** A crop region in percent of the image, as the crop tool draws it */
export interface PercentRegion {
  x: number
  y: number
  width: number
  height: number
  unit: '%'
}

export const ASPECT_OPTIONS: ReadonlyArray<{ label: string; value: number | undefined }> = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
]

/** The aspect ratios the preview strip shows, each a variant the image route renders */
export const PREVIEW_ASPECTS: ReadonlyArray<{ label: string; aspect: string | null }> = [
  { label: 'Original', aspect: null },
  { label: '1:1', aspect: '1:1' },
  { label: '16:9', aspect: '16:9' },
  { label: '4:3', aspect: '4:3' },
  { label: '3:2', aspect: '3:2' },
]

export function toPercentRegion(crop: MediaCrop): PercentRegion {
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height, unit: '%' }
}

const round = (value: number): number => Math.round(value * 100) / 100

/** The crop the API stores, to two decimals; null when nothing is drawn */
export function toMediaCrop(region: PercentRegion | undefined): MediaCrop | null {
  if (!region || region.width <= 0 || region.height <= 0) return null
  return {
    x: round(region.x),
    y: round(region.y),
    width: round(region.width),
    height: round(region.height),
  }
}

/** The hotspot's size: a fixed ellipse, as the editor has always placed it */
const HOTSPOT_SIZE = 15

const clamp = (value: number): number => Math.max(0, Math.min(100, value))

/** A hotspot centred at a point, in percent of the image */
export function hotspotAt(x: number, y: number): MediaHotspot {
  return { x: clamp(x), y: clamp(y), width: HOTSPOT_SIZE, height: HOTSPOT_SIZE }
}

/** How far an arrow key moves the hotspot, in percent */
const NUDGE = 2

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-NUDGE, 0],
  ArrowRight: [NUDGE, 0],
  ArrowUp: [0, -NUDGE],
  ArrowDown: [0, NUDGE],
}

/**
 * The hotspot after a key: an arrow moves it (placing it in the centre first
 * when there is none); any other key changes nothing (null)
 */
export function nudgeHotspot(hotspot: MediaHotspot | null, key: string): MediaHotspot | null {
  const step = ARROWS[key]
  if (!step) return null
  const from = hotspot ?? hotspotAt(50, 50)
  return hotspot ? hotspotAt(from.x + step[0], from.y + step[1]) : from
}

/** The image route's URL for a preview at an aspect ratio; `v` changes after each save */
export function previewSrc(id: string, aspect: string | null, version: number): string {
  const query = new URLSearchParams({ preset: 'md', fmt: 'webp' })
  if (aspect) query.set('aspect', aspect)
  query.set('v', String(version))
  return `/api/media/${encodeURIComponent(id)}/image?${query}`
}
