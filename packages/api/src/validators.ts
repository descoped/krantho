import type { MediaCrop, MediaHotspot } from '@krantho/persistence'
import type { Collection } from '@krantho/schema'
import type { ZodObject, ZodRawShape } from 'zod'
import type { ApiContext, ApiResponse } from './types.js'

const VALID_STATUSES = ['draft', 'published', 'archived'] as const

/** Type-safe inclusion check for const arrays — avoids `as readonly string[]` casts. */
export function isOneOf<T extends string>(arr: readonly T[], value: string): value is T {
  return (arr as readonly string[]).includes(value)
}

/** Validate that a collection exists in the content config */
export function validateCollectionParam(
  collection: string | undefined,
  ctx: ApiContext,
):
  | { isValid: true; collection: string; collectionDef: Collection<ZodObject<ZodRawShape>> }
  | { isValid: false; response: ApiResponse } {
  if (!collection) {
    return {
      isValid: false,
      response: { status: 400, body: { error: 'Missing collection parameter' } },
    }
  }
  const collectionDef = ctx.contentConfig.collections.get(collection)
  if (!collectionDef) {
    return {
      isValid: false,
      response: { status: 404, body: { error: `Collection "${collection}" not found` } },
    }
  }
  return { isValid: true, collection, collectionDef }
}

/** Validate request body is a non-null object */
export function validateRequestBody(
  body: unknown,
): { isValid: true; body: Record<string, unknown> } | { isValid: false; response: ApiResponse } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      response: { status: 400, body: { error: 'Request body must be a JSON object' } },
    }
  }
  return { isValid: true, body: body as Record<string, unknown> }
}

/** Parse and validate a status query parameter: draft, published or archived */
export function parseStatusParam(
  value: string | undefined,
): 'draft' | 'published' | 'archived' | undefined {
  if (!value) return undefined
  if (value === 'draft' || value === 'published' || value === 'archived') {
    return value
  }
  return undefined
}

/** Parse and validate a positive integer query parameter */
export function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) return undefined
  return parsed
}

/**
 * Apply the configured page-size cap to a requested list limit.
 *
 * `content.list.maxLimit` is unset by default, and an unset cap means a list
 * without a `limit` parameter returns every row — the behaviour the API has
 * always had. Setting it both caps an oversized request and imposes a page size
 * on a request that asked for none. A negative or NaN request counts as no
 * request, so it can never slip past the cap (SQLite reads `LIMIT -1` as
 * unbounded).
 */
export function applyListLimit(
  requested: number | undefined,
  maxLimit: number | undefined,
): number | undefined {
  const wanted = requested !== undefined && requested >= 0 ? requested : undefined
  if (maxLimit === undefined) return wanted
  if (wanted === undefined) return maxLimit
  return Math.min(wanted, maxLimit)
}

/** Parse and validate a locale query parameter */
export function parseLocaleParam(value: string | undefined): string | undefined {
  if (!value) return undefined
  // Locale must be 2-5 char alphanumeric with optional hyphen (e.g., en, en-US, nb-NO)
  if (/^[a-z]{2}(-[A-Za-z]{2,3})?$/.test(value)) return value
  return undefined
}

/** Validate that a named route parameter exists */
export function requireParam(
  params: Record<string, string> | undefined,
  name: string,
): { isValid: true; value: string } | { isValid: false; response: ApiResponse } {
  const value = params?.[name]
  if (!value) {
    return {
      isValid: false,
      response: { status: 400, body: { error: `Missing parameter: ${name}` } },
    }
  }
  return { isValid: true, value }
}

/** Validate that a slug parameter exists */
export function validateSlugParam(
  slug: string | undefined,
): { isValid: true; slug: string } | { isValid: false; response: ApiResponse } {
  if (!slug) {
    return { isValid: false, response: { status: 400, body: { error: 'Missing parameter: slug' } } }
  }
  return { isValid: true, slug }
}

/** Parse a named cookie from a cookie header string */
export function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`))
  return match ? match.split('=')[1]?.trim() : undefined
}

/**
 * Validate a crop region. Crop must fit entirely within the image (x + w <= 100).
 */
export function validateCrop(
  crop: unknown,
): { isValid: true; crop: MediaCrop } | { isValid: false; error: string } {
  if (typeof crop !== 'object' || crop === null) {
    return { isValid: false, error: 'Crop must be an object' }
  }
  const c = crop as Record<string, unknown>
  const x = typeof c.x === 'number' ? c.x : NaN
  const y = typeof c.y === 'number' ? c.y : NaN
  const w = typeof c.width === 'number' ? c.width : NaN
  const h = typeof c.height === 'number' ? c.height : NaN
  if (
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    Number.isNaN(w) ||
    Number.isNaN(h) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > 100 ||
    y + h > 100
  ) {
    return {
      isValid: false,
      error: 'Invalid crop: x, y, width, height must be numbers 0-100 with width/height > 0',
    }
  }
  return { isValid: true, crop: { x, y, width: w, height: h } }
}

/**
 * Validate a hotspot center + ellipse. Unlike crop, hotspot can overflow image bounds
 * because it represents a center of interest, not a hard crop boundary. The image
 * optimizer clamps the computed crop region to image bounds at serve time.
 * Width/height are stored for UI rendering (ellipse visualization) — only center (x, y)
 * is used by the image optimizer for crop positioning.
 */
export function validateHotspot(
  hotspot: unknown,
): { isValid: true; hotspot: MediaHotspot } | { isValid: false; error: string } {
  if (typeof hotspot !== 'object' || hotspot === null) {
    return { isValid: false, error: 'Hotspot must be an object' }
  }
  const h = hotspot as Record<string, unknown>
  const x = typeof h.x === 'number' ? h.x : NaN
  const y = typeof h.y === 'number' ? h.y : NaN
  const w = typeof h.width === 'number' ? h.width : NaN
  const ht = typeof h.height === 'number' ? h.height : NaN
  if (
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    Number.isNaN(w) ||
    Number.isNaN(ht) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    ht <= 0 ||
    x > 100 ||
    y > 100 ||
    w > 100 ||
    ht > 100
  ) {
    return {
      isValid: false,
      error: 'Invalid hotspot: x, y, width, height must be numbers 0-100 with width/height > 0',
    }
  }
  return { isValid: true, hotspot: { x, y, width: w, height: ht } }
}

/** Parse and validate a checkpoint version from route params */
export function parseCheckpointVersion(
  params: Record<string, string> | undefined,
): { isValid: true; version: number } | { isValid: false; response: ApiResponse } {
  const result = requireParam(params, 'version')
  if (!result.isValid) return result

  const version = parseInt(result.value, 10)
  if (Number.isNaN(version)) {
    return { isValid: false, response: { status: 400, body: { error: 'Invalid version number' } } }
  }
  return { isValid: true, version }
}

/** Type predicate: narrows ctx to have non-undefined mediaStorage */
export function hasMediaStorage(
  ctx: ApiContext,
): ctx is ApiContext & { mediaStorage: NonNullable<ApiContext['mediaStorage']> } {
  return ctx.mediaStorage !== undefined
}

/** 501 response for missing media storage */
export const MEDIA_NOT_CONFIGURED: ApiResponse = {
  status: 501,
  body: { error: 'Media storage not configured' },
}

/** Format Zod validation errors into API response details */
export function formatZodErrors(
  issues: ReadonlyArray<{
    path: PropertyKey[]
    message: string
    code?: string
    keys?: readonly string[]
  }>,
): Array<{ field: string; message: string }> {
  return issues.flatMap((issue) => {
    const paths =
      issue.code === 'unrecognized_keys' && issue.keys?.length
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path]
    return paths.map((path) => ({
      field: path.map(String).join('.') || '(root)',
      message: issue.message,
    }))
  })
}
