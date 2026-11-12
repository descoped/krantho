import type { SeoLimits } from './api-types.js'
import { resolveSeoFields } from './seo-field-resolver.js'

export interface CheckItem {
  label: string
  pass: boolean
  hint: string
}

/** The title against the site's limit; with no limit loaded, present is enough */
function titleCheck(title: string, limits: SeoLimits | null): CheckItem {
  const max = limits?.title.maxChars
  if (title.length === 0) return { label: 'Page title', pass: false, hint: 'Missing title' }
  if (max === undefined) return { label: 'Page title', pass: true, hint: `${title.length} chars` }
  return {
    label: 'Page title',
    pass: title.length <= max,
    hint: title.length > max ? `Too long (${title.length}/${max})` : `${title.length}/${max} chars`,
  }
}

/** The meta description against the site's range; with no limits loaded, present is enough */
function metaCheck(description: string, limits: SeoLimits | null): CheckItem {
  const label = 'Meta description'
  const length = description.length
  if (length === 0) return { label, pass: false, hint: 'Missing' }
  if (!limits) return { label, pass: true, hint: `${length} chars` }
  const { minChars: min, maxChars: max } = limits.metaDescription
  if (length < min) return { label, pass: false, hint: `Too short (${length}/${min}–${max})` }
  if (length > max) return { label, pass: false, hint: `Too long (${length}/${max})` }
  return { label, pass: true, hint: `${length}/${max} chars` }
}

/**
 * Run SEO quality checks on content fields and body. Title and meta
 * description lengths are judged against the limits the site configures —
 * the same the API's checks use.
 */
export function runChecks(
  fields: Record<string, unknown>,
  body: string,
  limits: SeoLimits | null,
): CheckItem[] {
  const { description: metaDesc, title } = resolveSeoFields(fields, ['description', 'title'])

  const checks: CheckItem[] = [titleCheck(title, limits), metaCheck(metaDesc, limits)]

  checks.push({
    label: 'Body content',
    pass: body.length > 100,
    hint:
      body.length === 0
        ? 'Empty body'
        : body.length < 100
          ? 'Very short content'
          : `${body.length} chars`,
  })

  const h2Count = (body.match(/^## /gm) ?? []).length
  checks.push({
    label: 'Heading structure',
    pass: h2Count > 0,
    hint: h2Count === 0 ? 'No ## headings found' : `${h2Count} section heading(s)`,
  })

  const linkCount = (body.match(/\[.*?\]\(.*?\)/g) ?? []).length
  checks.push({
    label: 'Links',
    pass: linkCount > 0,
    hint: linkCount === 0 ? 'No links in content' : `${linkCount} link(s)`,
  })

  return checks
}
