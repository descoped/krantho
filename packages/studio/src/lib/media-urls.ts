import type { MediaItem } from './api-types.js'

/** FNV-1a over a string, as a short base-36 tag */
function shortHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Studio preview URL for a media item. The stable image URL is the same before
 * and after a replace, and a browser reuses an image it already holds for an
 * unchanged URL, so `v` changes whenever the bytes or their framing change.
 * The API ignores `v`; the redirect it answers carries the real revision.
 */
export function mediaPreviewUrl(
  item: Pick<MediaItem, 'id' | 'url' | 'crop' | 'hotspot'>,
  preset: string,
): string {
  const v = shortHash(`${item.url}|${JSON.stringify(item.crop)}|${JSON.stringify(item.hotspot)}`)
  return `/api/media/${item.id}/image?preset=${preset}&v=${v}`
}

/**
 * The stable image URL of a media item: it names the item by its id and
 * redirects to the current revision, so it stays the same across a rename or
 * a replace. This is the URL content embeds.
 */
export function mediaStableUrl(id: string): string {
  return `/api/media/${id}/image?preset=xl`
}

/**
 * Markdown image for a media item. It embeds the stable image URL, which
 * redirects to the current revision, so a replace shows on the next view.
 */
export function mediaMarkdown(item: Pick<MediaItem, 'id' | 'altText'>): string {
  const alt = item.altText
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\[\]]/g, (ch) => `\\${ch}`)
  return `![${alt}](${mediaStableUrl(item.id)})`
}
