/** A plain object: not null, not an array */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A URL from data that is safe to link to: an `http(s)` URL or a path on this
 * site; null for anything else, such as a `javascript:` URL
 */
export function safeHref(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
