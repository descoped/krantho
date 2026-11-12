import { type ContentDocument, canGetContent } from '@krantho/persistence'
import { documentSeoConfig, type SeoConfigData } from '@krantho/seo-shared'
import { changedByFromAuth } from './permissions.js'
import { type SaveDocumentResult, saveDocument } from './save-document.js'
import type { ApiContext } from './types.js'

export function documentOfSeoId(id: string): { collection: string; slug: string } | null {
  if (!id.startsWith('doc:')) return null
  const slash = id.indexOf('/', 4)
  return slash > 4 && slash < id.length - 1
    ? { collection: id.slice(4, slash), slug: id.slice(slash + 1) }
    : null
}

export async function documentSeo(
  ctx: ApiContext,
  id: string,
  locale?: string | undefined,
): Promise<{
  document: ContentDocument
  config: SeoConfigData | null
} | null> {
  const target = documentOfSeoId(id)
  if (!target || !canGetContent(ctx.adapter)) return null
  const document = await ctx.adapter.getContent(target.collection, target.slug, locale)
  return document && document.meta.locale === (locale ?? ctx.config.site.defaultLocale)
    ? { document, config: documentSeoConfig(document.metadata) }
    : null
}

/** Authored SEO is a draft document edit, with its lock, validation and version check. */
export async function saveDocumentSeo(
  ctx: ApiContext,
  document: ContentDocument,
  config: SeoConfigData | null,
  expectedVersion: number,
  changedBy = changedByFromAuth(ctx.auth),
): Promise<SaveDocumentResult> {
  const metadata = { ...document.metadata }
  if (config) metadata['seo'] = config as unknown as Record<string, unknown>
  else delete metadata['seo']
  return saveDocument(ctx, {
    collection: document.meta.collection,
    slug: document.meta.slug,
    locale: document.meta.locale,
    fields: document.fields,
    body: document.body,
    metadata,
    isNew: false,
    expectedVersion,
    changedBy,
  })
}
