import type { LLMAdapter } from '@krantho/ai'
import { structuredComplete } from '@krantho/ai'
import type { SeoSection, SiteSection } from '@krantho/config'
import type { ContentDocument, ISeoConfigAdapter } from '@krantho/persistence'
import {
  documentSeoConfig,
  documentSeoProperties,
  resolveEffectiveTypes,
} from '@krantho/seo-shared'
import { documentSeo, saveDocumentSeo } from '../document-seo.js'
import type { ApiContext } from '../types.js'
import type { EnrichJob } from './seo-enrich-runner.js'

/** Content and token budgets for archetype enrichment (`seo.enrichment.archetype`) */
export type ArchetypeEnrichmentLimits = SeoSection['enrichment']['archetype']

/**
 * Minimal shape of a Schema.org property definition as returned by
 * `@krantho/seo`'s `getTypeProperties`. Kept as a local interface so this
 * handler does not take a hard dependency on `@krantho/seo`'s public types —
 * the real function is injected by the runner at job start.
 */
export interface ArchetypePropertyDef {
  property: string
  source: string
}

/** Injected lookup — provided by the runner once per job from `@krantho/seo`. */
export type GetTypePropertiesFn = (type: string) => readonly ArchetypePropertyDef[]

/**
 * Build an archetype-aware enrichment prompt.
 * Uses existing user-edited properties as context for better generation.
 */
export function buildArchetypePrompt(
  siteName: string,
  language: string,
  schemaType: string,
  missingProperties: string[],
  existingProperties: Record<string, unknown>,
  contentText: string,
  contentCap: number,
): string {
  const existingContext = Object.entries(existingProperties)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n')

  return `You are an SEO expert for ${siteName}.

Generate Schema.org ${schemaType} property values based on the content below.

Already configured — use these as context; they are not regenerated:
${existingContext || '  (none)'}

Properties to generate:
${missingProperties.map((p) => `  - ${p}`).join('\n')}

Requirements:
- Written in ${language}
- Natural language and concise, appropriate for Schema.org
- State only what the content below says. Never infer, guess or add facts the content does not give: no categories, keywords, legal references, phone numbers, prices or addresses of your own
- Return a JSON object with one entry per property: "value" is the property, "evidence" is the exact passage of the content (or of the configured values) that states it
- When the content does not state a property, return empty strings for both its "value" and its "evidence"

Content:
${contentText.slice(0, contentCap)}`
}

/** What the model returns for one property: the value, and the passage of the content that states it */
interface GroundedValue {
  value: string
  evidence: string
}

/** A text as its words alone: case, punctuation, markdown and spacing do not tell two quotes apart */
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The share of the value's longer words that the sources use */
function wordsShared(value: string, padded: string): number {
  const own = words(value)
    .split(' ')
    .filter((word) => word.length >= 3)
  if (own.length === 0) return 1
  return own.filter((word) => padded.includes(` ${word} `)).length / own.length
}

/**
 * Whether the sources state the value: the quoted passage (two words, or the value itself) is in
 * them, whole words and all, every number the value names is too, and at least half of the
 * value's own words are. A value without a quote the content contains is the model's own.
 */
export function isGrounded(grounded: unknown, sources: string): grounded is GroundedValue {
  if (typeof grounded !== 'object' || grounded === null) return false
  const { value, evidence } = grounded as Record<string, unknown>
  if (typeof value !== 'string' || typeof evidence !== 'string') return false
  const padded = ` ${words(sources)} `
  const quote = words(evidence)
  if (value.trim().length === 0 || quote.length < 3) return false
  if (quote.includes(' ') === false && quote !== words(value)) return false
  if (!padded.includes(` ${quote} `)) return false
  const numbers = words(value).match(/\d+/g) ?? []
  if (!numbers.every((number) => padded.includes(` ${number} `))) return false
  return wordsShared(value, padded) >= 0.5
}

/** Resolved enrichment context — the shape built once per document and passed to subsequent steps. */
interface EnrichmentContext {
  readonly configId: string
  readonly schemaTypes: readonly string[]
  readonly existingProps: Record<string, unknown>
  readonly autoValues: Record<string, unknown>
}

/** Load the scope-chain configs and collapse them into an EnrichmentContext. */
async function loadEnrichmentContext(
  target: { collection: string; slug: string },
  content: ContentDocument,
  seoConfigAdapter: ISeoConfigAdapter,
): Promise<EnrichmentContext> {
  const configId = `doc:${target.collection}/${target.slug}`
  const [siteRes, colRes] = await Promise.all([
    seoConfigAdapter.getConfig('site'),
    seoConfigAdapter.getConfig(`collection:${target.collection}`),
  ])

  return {
    configId,
    schemaTypes: resolveEffectiveTypes(
      documentSeoConfig(content.metadata),
      colRes?.config ?? null,
      siteRes?.config ?? null,
    ),
    existingProps: documentSeoConfig(content.metadata)?.entities[0]?.properties ?? {},
    autoValues: { ...content.fields, ...documentSeoProperties(content.metadata) },
  }
}

/**
 * Find Schema.org properties across the given types that are neither user-edited
 * nor auto-mapped from CMS fields, and therefore need LLM generation.
 *
 * Deduplicates by property name across types (a property on multiple types is
 * generated once). Respects `force` — when true, every property is considered
 * missing regardless of existing values.
 */
function findMissingProperties(
  schemaTypes: readonly string[],
  autoValues: Record<string, unknown>,
  existingProps: Record<string, unknown>,
  force: boolean,
  getTypeProperties: GetTypePropertiesFn,
): { uniqueCount: number; missing: string[] } {
  const allDefs: ArchetypePropertyDef[] = []
  for (const type of schemaTypes) {
    for (const p of getTypeProperties(type)) {
      // Skip computed properties (extracted from markdown headings, not LLM-generated)
      if (p.source === 'computed') continue
      allDefs.push(p)
    }
  }

  const seen = new Set<string>()
  const missing: string[] = []
  for (const p of allDefs) {
    if (seen.has(p.property)) continue
    seen.add(p.property)

    const userVal = existingProps[p.property]
    if (typeof userVal === 'string' && userVal.length > 0 && !force) continue

    const autoVal = autoValues[p.property]
    if (typeof autoVal === 'string' && autoVal.length > 0 && !force) continue

    missing.push(p.property)
  }

  return { uniqueCount: seen.size, missing }
}

/**
 * Extract a text blob suitable for LLM context from a content document.
 *
 * Prefers the markdown body, falls back to concatenating string fields when
 * the body is too short (common for services/products where metadata carries
 * most of the signal).
 */
function extractContentText(content: { fields: Record<string, unknown>; body: string }): string {
  const body = content.body?.trim() ?? ''
  if (body.length >= 50) return body

  const parts: string[] = []
  for (const [key, val] of Object.entries(content.fields)) {
    if (key === 'status') continue
    if (typeof val === 'string' && val.length > 3) parts.push(`${key}: ${val}`)
  }
  return parts.join('\n')
}

/** Whether a stored property value counts as unset */
export function isUnsetProperty(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.length === 0)
}

/**
 * The LLM-generated values that may be written: those the sources state, and never over a user
 * edit (unless `force`).
 */
function acceptedProperties(
  existingProps: Record<string, unknown>,
  generated: Record<string, unknown>,
  sources: string,
  force: boolean,
): Record<string, string> {
  const add: Record<string, string> = {}
  for (const [key, grounded] of Object.entries(generated)) {
    if (!isGrounded(grounded, sources)) continue
    if (isUnsetProperty(existingProps[key]) || force) add[key] = grounded.value
  }
  return add
}

/** The text a quote may come from: the part of the content the model saw, and the configured values */
function evidenceSources(
  contentText: string,
  contentCap: number,
  context: Record<string, unknown>,
): string {
  const configured = Object.values(context).filter((v): v is string => typeof v === 'string')
  return [contentText.slice(0, contentCap), ...configured].join('\n')
}

/** Generated Schema.org properties for one document, not yet saved */
export interface ArchetypeProposal {
  /** `doc:<collection>/<slug>` */
  configId: string
  /** The document's effective Schema.org types */
  schemaTypes: string[]
  /** The generated values the content states, for the properties that were unset (or all of them with `force`) */
  add: Record<string, string>
  /** Properties the model was asked for */
  requested: number
  baseVersion: number
  locale: string
}

/**
 * Generate values for the document's Schema.org properties that are neither
 * user-edited nor mapped from its fields. The reason when there is nothing to
 * generate; throws when the model call fails.
 */
export async function proposeArchetypeProperties(
  target: { collection: string; slug: string },
  content: ContentDocument,
  llm: LLMAdapter,
  seoConfigAdapter: ISeoConfigAdapter,
  site: SiteSection,
  limits: ArchetypeEnrichmentLimits,
  force: boolean,
  getTypeProperties: GetTypePropertiesFn,
): Promise<{ skip: string } | ArchetypeProposal> {
  const ctx = await loadEnrichmentContext(target, content, seoConfigAdapter)
  if (ctx.schemaTypes.length === 0) return { skip: 'No archetype configured' }

  const { uniqueCount, missing } = findMissingProperties(
    ctx.schemaTypes,
    ctx.autoValues,
    ctx.existingProps,
    force,
    getTypeProperties,
  )
  if (missing.length === 0) return { skip: `All ${uniqueCount} properties already filled` }

  const contentText = extractContentText(content)
  if (contentText.length < 20) return { skip: 'Insufficient content for enrichment' }

  const context = { ...ctx.autoValues, ...ctx.existingProps }
  const prompt = buildArchetypePrompt(
    site.name,
    site.language,
    ctx.schemaTypes[0] ?? 'WebPage',
    missing,
    context,
    contentText,
    limits.contentCap,
  )
  const grounded = {
    type: 'object',
    properties: { value: { type: 'string' }, evidence: { type: 'string' } },
    required: ['value', 'evidence'],
  }
  const dynamicSchema = {
    type: 'object',
    properties: Object.fromEntries(missing.map((p) => [p, grounded])),
    required: missing,
  }
  const generated = await structuredComplete<Record<string, unknown>>(llm, prompt, dynamicSchema, {
    maxTokens: limits.maxTokens,
  })

  const sources = evidenceSources(contentText, limits.contentCap, context)
  const add = acceptedProperties(ctx.existingProps, generated, sources, force)
  return {
    configId: ctx.configId,
    schemaTypes: [...ctx.schemaTypes],
    add,
    requested: missing.length,
    baseVersion: content.meta.version,
    locale: content.meta.locale,
  }
}

/**
 * Save a proposal: merge its added properties into the document's current
 * primary entity — a property set since the proposal is kept unless the
 * proposal adds it — or create one entity per type when there is none.
 */
export async function saveArchetypeProposal(
  ctx: ApiContext,
  proposal: Pick<ArchetypeProposal, 'configId' | 'schemaTypes' | 'add' | 'baseVersion' | 'locale'>,
): Promise<void> {
  const current = await documentSeo(ctx, proposal.configId, proposal.locale)
  if (!current) throw new Error('Document not found')
  const existingData = current.config ?? { entities: [] }
  const merged = { ...(existingData.entities[0]?.properties ?? {}), ...proposal.add }
  const updatedEntities =
    existingData.entities.length > 0
      ? existingData.entities.map((e, i) => (i === 0 ? { ...e, properties: merged } : e))
      : proposal.schemaTypes.map((t) => ({ '@type': t, properties: merged }))

  const saved = await saveDocumentSeo(
    ctx,
    current.document,
    { ...existingData, entities: updatedEntities },
    proposal.baseVersion,
  )
  if (!saved.ok)
    throw new Error(
      String((saved.response.body as { error?: string }).error ?? 'Document save failed'),
    )
}

/** Enrich all Schema.org properties for a document based on its archetype config. */
export async function enrichArchetypeProperties(
  item: EnrichJob['items'][number],
  content: ContentDocument,
  llm: LLMAdapter,
  seoConfigAdapter: ISeoConfigAdapter | null,
  site: SiteSection,
  limits: ArchetypeEnrichmentLimits,
  force: boolean,
  getTypeProperties: GetTypePropertiesFn,
  ctx: ApiContext,
): Promise<'generated' | 'skipped' | 'error'> {
  if (!seoConfigAdapter) {
    item.status = 'skipped'
    item.result = 'SEO config adapter not available'
    return 'skipped'
  }

  item.status = 'generating'
  try {
    const proposal = await proposeArchetypeProperties(
      item,
      content,
      llm,
      seoConfigAdapter,
      site,
      limits,
      force,
      getTypeProperties,
    )
    if ('skip' in proposal) {
      item.status = 'skipped'
      item.result = proposal.skip
      return 'skipped'
    }

    await saveArchetypeProposal(ctx, proposal)

    const filledCount = Object.keys(proposal.add).length
    item.status = 'complete'
    item.result = `Generated ${filledCount}/${proposal.requested} properties for ${proposal.schemaTypes.join(', ')}`
    return 'generated'
  } catch (err: unknown) {
    item.status = 'error'
    item.error = err instanceof Error ? err.message : 'LLM generation failed'
    return 'error'
  }
}
