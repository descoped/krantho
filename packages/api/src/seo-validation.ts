import { documentPath } from '@krantho/core'
import { canGetContent } from '@krantho/persistence'
import { buildSeoFieldMap, documentSeoProperties, resolveSeoField } from '@krantho/seo-shared'
import type { SeoFinding } from './assistant/protocol.js'
import { composePageJsonLd } from './seo-compose.js'
import { isSeoModuleMissing, loadSeo } from './seo-subsystem.js'
import type { ApiContext } from './types.js'

/** Title and meta description checks, with the limits the site's configuration sets */
export function metaFindings(ctx: ApiContext, fields: Record<string, unknown>): SeoFinding[] {
  const findings: SeoFinding[] = []
  const fieldMap = buildSeoFieldMap(Object.keys(fields))

  const title = resolveSeoField(fieldMap, 'title', fields)
  const titleMax = ctx.config.seo.enrichment.title.maxChars
  if (!title) {
    findings.push({ severity: 'error', check: 'title', message: 'The document has no title.' })
  } else if (title.length > titleMax) {
    const message = `The title is ${title.length} characters; the site's limit is ${titleMax}.`
    findings.push({ severity: 'warning', check: 'title', message })
  }

  const { minChars, maxChars } = ctx.config.seo.enrichment.meta
  const description = resolveSeoField(fieldMap, 'description', fields)
  if (!description) {
    const message = 'The document has no meta description.'
    findings.push({ severity: 'error', check: 'meta-description', message })
  } else if (description.length < minChars || description.length > maxChars) {
    const message = `The meta description is ${description.length} characters; aim for ${minChars}–${maxChars}.`
    findings.push({ severity: 'warning', check: 'meta-description', message })
  }
  return findings
}

/** The document a check names does not exist */
export class DocumentNotFoundError extends Error {
  constructor(collection: string, slug: string) {
    super(`Content "${collection}/${slug}" not found`)
    this.name = 'DocumentNotFoundError'
  }
}

/**
 * Check a document's current version (the draft the assistant works on) for
 * SEO: its title and meta description against the configured limits, and its
 * composed JSON-LD against the Schema.org vocabulary and each active reader's
 * rules — every structured-data finding names the reader it comes from.
 * Throws a {@link DocumentNotFoundError} when the document does not exist.
 */
export async function validateDocumentSeo(
  ctx: ApiContext,
  collection: string,
  slug: string,
  locale: string | undefined,
): Promise<SeoFinding[]> {
  const current = canGetContent(ctx.adapter)
    ? await ctx.adapter.getContent(collection, slug, locale)
    : null
  if (!current || current.meta.locale !== (locale ?? ctx.config.site.defaultLocale))
    throw new DocumentNotFoundError(collection, slug)

  const properties = documentSeoProperties(current.metadata)
  const findings = metaFindings(ctx, {
    ...current.fields,
    ...properties,
    title: properties.headline ?? properties.name ?? current.fields.title,
    'meta-description':
      properties.description ?? current.fields['meta-description'] ?? current.fields.description,
  })
  let seo: Awaited<ReturnType<typeof loadSeo>>
  try {
    seo = await loadSeo(ctx.config)
  } catch (err) {
    if (!isSeoModuleMissing(err)) throw err
    const message = 'Structured-data checks need the @krantho/seo package.'
    return [...findings, { severity: 'info', check: 'structured-data', message }]
  }

  const collectionDef = ctx.contentConfig.collections.get(collection) ?? { name: collection }
  const graph = await composePageJsonLd({
    collection,
    slug,
    path: documentPath(collectionDef, slug),
    fields: { ...current.fields, ...documentSeoProperties(current.metadata) },
    metadata: current.metadata,
    documentMeta: current.meta,
    config: ctx.config,
    seoConfigs: ctx.seoConfigAdapter,
  })
  return [...findings, ...structuredFindings(seo, graph)]
}

/** A graph's structured-data findings, each naming the reader (or Schema.org) it comes from */
export function structuredFindings(
  seo: Awaited<ReturnType<typeof loadSeo>>,
  graph: Record<string, unknown>,
): SeoFinding[] {
  return seo.validate(graph).map((finding) => ({
    severity: finding.severity,
    check: 'structured-data',
    message: finding.message,
    reader: finding.profile,
    code: finding.code,
    type: finding.type,
    property: finding.property,
    source: finding.source,
  }))
}
