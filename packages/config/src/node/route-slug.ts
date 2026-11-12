/**
 * Route patterns as file names, for the `routes/` directory of SEO
 * definitions: `/services/strategic/*` ↔ `services__strategic____WILD__`.
 */

/** Encode a URL pattern as a file name */
export function encodeRouteSlug(pattern: string): string {
  return pattern
    .replace(/^\/+|\/+$/g, '') // trim leading/trailing slashes
    .replace(/\*\*/g, '__GLOB__')
    .replace(/\*/g, '__WILD__')
    .replace(/\//g, '__')
}

/** Decode a file name back to its URL pattern */
export function decodeRouteSlug(slug: string): string {
  // Replace sentinels before path separators — sentinels contain '__' which
  // the path-separator regex would otherwise split.
  const restored = slug
    .replace(/__GLOB__/g, '**')
    .replace(/__WILD__/g, '*')
    .replace(/__/g, '/')
  return `/${restored}`
}
