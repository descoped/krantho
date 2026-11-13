/** System fields extracted from YAML frontmatter into document meta */
const SYSTEM_FIELDS = new Set([
  'status',
  'locale',
  'identity',
  'contract',
  'metadata',
  'defaults',
  'basis',
])

/**
 * Status given to a markdown file whose frontmatter declares none.
 *
 * A deployment sets this through `content.defaultStatus.filesystem` in the
 * krantho configuration tree and the caller passes it in. This literal is the
 * fallback for callers that pass nothing, and mirrors that tree's default.
 * `@krantho/core` stays free of a dependency on the configuration package.
 */
export const DEFAULT_FRONTMATTER_STATUS = 'published'

/**
 * Separate system fields (status, locale) from content fields in parsed frontmatter.
 *
 * @param defaultLocale - locale for a file whose frontmatter declares none: the
 *   site's default locale, `site.defaultLocale` in the krantho configuration
 * @param defaultStatus - status for a file whose frontmatter declares none
 */
export function splitFrontmatter(
  data: Record<string, unknown>,
  defaultLocale: string,
  defaultStatus: string = DEFAULT_FRONTMATTER_STATUS,
): {
  fields: Record<string, unknown>
  status: string
  locale: string
} {
  const fields: Record<string, unknown> = {}
  let status = defaultStatus
  let locale = defaultLocale

  for (const [key, value] of Object.entries(data)) {
    if (key === 'status' && typeof value === 'string') {
      status = value
    } else if (key === 'locale' && typeof value === 'string') {
      locale = value
    } else if (!SYSTEM_FIELDS.has(key)) {
      fields[key] = value
    }
  }

  const identity = data.identity
  if (identity && typeof identity === 'object' && !Array.isArray(identity)) {
    const value = (identity as Record<string, unknown>).locale
    if (typeof value === 'string') locale = value
  }
  return { fields, status, locale }
}
