import { documentPath, type PageCollection, rendersPages } from '@krantho/core'
import { type ContentSummary, canReadPublished, type PublishedReader } from '@krantho/persistence'
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import { PUBLIC_MACHINE_READ_CACHE_CONTROL } from '../public-cache.js'
import type { ApiContext, ApiHandler } from '../types.js'
import { isNoindex } from './seo-sitemap.js'

/** The route serving the site's llms.txt */
export const SEO_LLMS_TXT_PATH = '/api/seo/llms.txt'

/** Site settings key holding the saved llms.txt snapshot */
export const LLMS_TXT_SETTING = 'seo.llmsTxt'

/** Text that replaces the generated summary and link descriptions */
export interface LlmsTxtOverrides {
  summary?: string | undefined
  /** Link descriptions keyed by `collection/slug` */
  descriptions?: ReadonlyMap<string, string> | undefined
}

/** One line of text: runs of whitespace, newlines included, become one space */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The site summary: the override, else the site SEO config's primary entity description */
async function siteSummary(ctx: ApiContext, overrides: LlmsTxtOverrides): Promise<string> {
  if (overrides.summary !== undefined) return oneLine(overrides.summary)
  const config = await ctx.seoConfigAdapter?.getConfig('site')
  const description = config?.config.entities[0]?.properties.description
  return typeof description === 'string' ? oneLine(description) : ''
}

/** `- [title](url): description` for one live document, or null when it is not listed */
function documentLine(
  ctx: ApiContext,
  collection: PageCollection,
  doc: ContentSummary,
  overrides: LlmsTxtOverrides,
): string | null {
  if (isNoindex(doc.fields)) return null
  const path = documentPath(collection, doc.meta.slug)
  if (path === null) return null

  const fieldMap = buildSeoFieldMap(Object.keys(doc.fields))
  const title = oneLine(resolveSeoField(fieldMap, 'title', doc.fields)) || doc.meta.slug
  const override = overrides.descriptions?.get(`${collection.name}/${doc.meta.slug}`)
  const description = oneLine(override ?? resolveSeoField(fieldMap, 'description', doc.fields))
  const baseUrl = ctx.config.site.baseUrl.replace(/\/$/, '')
  const link = `- [${title}](${baseUrl}${path})`
  return description ? `${link}: ${description}` : link
}

/** The `## collection` block of one collection, or null when it lists nothing */
async function collectionBlock(
  ctx: ApiContext,
  adapter: PublishedReader,
  collection: PageCollection,
  overrides: LlmsTxtOverrides,
): Promise<string | null> {
  const { items: docs } = await adapter.query({
    state: 'published',
    projection: 'summary',
    collections: [collection.name],
  })
  const lines = docs
    .map((doc) => documentLine(ctx, collection, doc, overrides))
    .filter((line): line is string => line !== null)
  if (lines.length === 0) return null
  return [`## ${collection.name}`, '', ...lines].join('\n')
}

/**
 * Build llms.txt (llmstxt.org) from the live documents: the site name, its
 * summary, then one section per collection with pages (`rendersPages()`) listing each live,
 * indexable document with its URL and description.
 */
export async function buildLlmsTxt(
  ctx: ApiContext,
  overrides: LlmsTxtOverrides = {},
): Promise<string> {
  const blocks = [`# ${oneLine(ctx.config.site.name)}`]
  const summary = await siteSummary(ctx, overrides)
  if (summary) blocks.push(`> ${summary}`)

  if (canReadPublished(ctx.adapter)) {
    for (const collection of ctx.contentConfig.collections.values()) {
      if (!rendersPages(collection)) continue
      const block = await collectionBlock(ctx, ctx.adapter, collection, overrides)
      if (block) blocks.push(block)
    }
  }

  return `${blocks.join('\n\n')}\n`
}

/** The saved llms.txt snapshot, or null when none is saved */
export async function loadLlmsTxtSnapshot(ctx: ApiContext): Promise<string | null> {
  const saved = await ctx.siteSettingsAdapter?.getSetting(LLMS_TXT_SETTING)
  return saved ? saved : null
}

/** The response header naming where the served llms.txt comes from */
const LLMS_TXT_ORIGIN_HEADER = 'x-krantho-llms-origin'

/**
 * GET /api/seo/llms.txt — the saved snapshot when there is one, else generated
 * from the live documents, as text/plain. The `x-krantho-llms-origin` header
 * says which: `snapshot` or `generated`.
 */
export const seoLlmsTxt: ApiHandler = async (_req, ctx) => {
  if (!canReadPublished(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support reading published content' } }
  }
  const snapshot = await loadLlmsTxtSnapshot(ctx)
  return {
    status: 200,
    body: snapshot ?? (await buildLlmsTxt(ctx)),
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': PUBLIC_MACHINE_READ_CACHE_CONTROL,
      [LLMS_TXT_ORIGIN_HEADER]: snapshot === null ? 'generated' : 'snapshot',
    },
  }
}
