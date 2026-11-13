import type { LLMAdapter } from '@krantho/ai'
import { structuredComplete } from '@krantho/ai'
import type { SeoSection, SiteSection } from '@krantho/config'
import type { ContentDocument, ISeoConfigAdapter } from '@krantho/persistence'
import { buildSeoFieldMap, documentSeoProperties } from '@krantho/seo-shared'
import { getActiveContract } from '../merged-schema.js'
import { saveDocument } from '../save-document.js'
import type { ApiContext } from '../types.js'
import type { EnrichJob } from './seo-enrich-runner.js'

/** Length bounds and budgets for a generated meta description (`seo.enrichment.meta`) */
export type MetaEnrichmentLimits = SeoSection['enrichment']['meta']

export const DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' } },
  required: ['description'],
}

export function buildMetaPrompt(
  siteName: string,
  language: string,
  text: string,
  limits: MetaEnrichmentLimits,
): string {
  return `You are an SEO expert for ${siteName}.

Write a meta description based on the text below.

Requirements:
- Between ${limits.minChars} and ${limits.maxChars} characters including spaces, so it displays in full in search results
- Written in ${language}
- Natural language, no keyword-stuffing
- No quotation marks around the text
- Only the description itself, nothing else
- Focus on what the user can expect from the page

Text:
${text.slice(0, limits.contentCap)}`
}

/** Where a document keeps its description and the text a description is written from */
export interface MetaDescriptionSource {
  /** The CMS field holding the description; null when the document has none */
  field: string | null
  /** The text the model writes the description from */
  text: string
}

/**
 * Whether a document needs a generated meta description: a description in its
 * SEO config or in its description field is never replaced unless `force`, and
 * a document with too little text is skipped. The reason when it is skipped.
 */
export async function prepareMetaDescription(
  _target: { collection: string; slug: string },
  content: ContentDocument,
  _seoConfigAdapter: ISeoConfigAdapter | null,
  force: boolean,
): Promise<{ skip: string } | MetaDescriptionSource> {
  const description = documentSeoProperties(content.metadata).description
  if (typeof description === 'string' && description.length > 0 && !force) {
    return { skip: `Authored description exists (${description.length} chars) — preserved` }
  }
  // Resolve which CMS field holds the description dynamically
  const properties = content.contract?.fields.properties
  const field = buildSeoFieldMap(
    Object.keys(properties && typeof properties === 'object' ? properties : content.fields),
  ).description

  // Check existing CMS field
  const existing = field ? content.fields[field] : undefined
  if (typeof existing === 'string' && existing.length > 0 && !force) {
    return { skip: `Already has ${field} (${existing.length} chars)` }
  }

  const text = descriptionSourceText(content, field)
  if (text.length < 20) return { skip: 'Insufficient content' }
  return { field, text }
}

/** Body text, or the document's string fields when the body is short */
function descriptionSourceText(
  content: { fields: Record<string, unknown>; body: string },
  descriptionField: string | null,
): string {
  const text = content.body?.trim() ?? ''
  if (text.length >= 50) return text
  const parts: string[] = []
  for (const [key, val] of Object.entries(content.fields)) {
    if (key === 'status' || key === descriptionField) continue
    if (typeof val === 'string' && val.length > 3) parts.push(val)
  }
  return parts.join('. ')
}

/** Generate a meta description from `text`, cut to `limits.maxChars` */
export async function generateMetaDescription(
  text: string,
  llm: LLMAdapter,
  site: SiteSection,
  limits: MetaEnrichmentLimits,
): Promise<string> {
  const prompt = buildMetaPrompt(site.name, site.language, text, limits)
  const result = await structuredComplete<{ description: string }>(
    llm,
    prompt,
    DESCRIPTION_SCHEMA,
    { maxTokens: limits.maxTokens },
  )

  // LLMs can't count characters reliably — hard truncate if too long
  const desc = result.description.trim()
  if (desc.length <= limits.maxChars) return desc
  return `${desc.slice(0, limits.maxChars - 1).replace(/\s+\S*$/, '')}.`
}

/** Enrich meta-description for a single item */
export async function enrichMetaDescription(
  item: EnrichJob['items'][number],
  content: ContentDocument,
  llm: LLMAdapter,
  ctx: ApiContext,
  seoConfigAdapter: ISeoConfigAdapter | null,
  site: SiteSection,
  limits: MetaEnrichmentLimits,
  force: boolean,
): Promise<'generated' | 'skipped' | 'error'> {
  const collection = ctx.contentConfig.collections.get(item.collection)
  if (!collection) throw new Error('Collection not found')
  const contract = await getActiveContract(collection, ctx.adapter)
  const source = await prepareMetaDescription(
    item,
    { ...content, contract },
    seoConfigAdapter,
    force,
  )
  if ('skip' in source) {
    item.status = 'skipped'
    item.result = source.skip
    return 'skipped'
  }

  if (!source.field && !contract.metadata.sharing) {
    item.status = 'skipped'
    item.result = 'No description property is declared by this document contract'
    return 'skipped'
  }
  item.status = 'generating'
  const desc = await generateMetaDescription(source.text, llm, site, limits)

  const fields = { ...content.fields }
  const metadata = structuredClone(content.metadata)
  if (source.field) fields[source.field] = desc
  else if (contract.metadata.sharing) {
    metadata.sharing = { ...metadata.sharing, description: desc }
  } else {
    item.status = 'skipped'
    item.result = 'No description property is declared by this document contract'
    return 'skipped'
  }
  const saved = await saveDocument(ctx, {
    collection: item.collection,
    slug: item.slug,
    locale: content.meta.locale,
    fields,
    metadata,
    body: content.body,
    isNew: false,
    expectedVersion: content.meta.version,
    changedBy: 'seo-enrichment',
  })
  if (!saved.ok)
    throw new Error(
      String((saved.response.body as { error?: string }).error ?? 'Document save failed'),
    )

  item.status = 'complete'
  item.result = `${desc.length} chars: ${desc}`
  return 'generated'
}
