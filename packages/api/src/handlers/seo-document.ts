import { documentPath } from '@krantho/core'
import { canGetContent } from '@krantho/persistence'
import { documentSeoProperties } from '@krantho/seo-shared'
import { requireRole } from '../permissions.js'
import { pageSeoConfig } from '../seo-compose.js'
import { loadSeoModule } from '../seo-loader.js'
import { siteSeoSummary } from '../seo-site-findings.js'
import { isSeoModuleMissing, loadSeo } from '../seo-subsystem.js'
import { DocumentNotFoundError, validateDocumentSeo } from '../seo-validation.js'
import type { ApiHandler, ApiResponse } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

type DocumentTarget =
  | { ok: true; collection: string; slug: string; locale: string | undefined; path: string | null }
  | { ok: false; response: ApiResponse }

/** The document a request names, checked: its collection exists and the caller may read Studio */
function documentTarget(
  req: Parameters<ApiHandler>[0],
  ctx: Parameters<ApiHandler>[1],
): DocumentTarget {
  const denied = requireRole(ctx.auth, 'viewer')
  if (denied) return { ok: false, response: denied }
  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return { ok: false, response: validated.response }
  const slug = requireParam(req.params, 'slug')
  if (!slug.isValid) return { ok: false, response: slug.response }
  return {
    ok: true,
    collection: validated.collection,
    slug: slug.value,
    locale: parseLocaleParam(req.query.locale),
    path: documentPath(validated.collectionDef, slug.value),
  }
}

/**
 * GET /api/seo/resolved/:collection/:slug — every entity of the document's
 * structured data with each property's effective value, its source (SEO
 * settings, a content field, computed from the page, the site
 * configuration), where it was read, and whether the SEO settings may set it.
 * Reads the current version, as the editor does.
 */
export const seoResolved: ApiHandler = async (req, ctx) => {
  const target = documentTarget(req, ctx)
  if (!target.ok) return target.response
  const { collection, slug, locale, path } = target

  const current = canGetContent(ctx.adapter)
    ? await ctx.adapter.getContent(collection, slug, locale)
    : null
  if (!current) {
    return { status: 404, body: { error: `Content "${collection}/${slug}" not found` } }
  }
  if (path === null) return { status: 200, body: { entities: [] } }

  const seo = await loadSeo(ctx.config)
  const page = await pageSeoConfig({
    collection,
    slug,
    path,
    seoConfigs: ctx.seoConfigAdapter,
    metadata: current.metadata,
  })
  const entities = seo.resolve({
    config: page.effective,
    fields: { ...current.fields, ...documentSeoProperties(current.metadata) },
    path,
    siteLevel: page.site,
    documentMeta: current.meta,
  })
  return { status: 200, body: { entities } }
}

/** The site's active readers with their names; none without `@krantho/seo` */
async function activeReaders(
  ctx: Parameters<ApiHandler>[1],
): Promise<Array<{ id: string; name: string }>> {
  try {
    const [seo, { getProfile }] = await Promise.all([loadSeo(ctx.config), loadSeoModule()])
    return seo.readers.map((id) => ({ id, name: getProfile(id)?.name ?? id }))
  } catch (err) {
    if (isSeoModuleMissing(err)) return []
    throw err
  }
}

/**
 * GET /api/seo/findings/:collection/:slug — the document's SEO findings: its
 * title and meta description against the site's limits, and its structured
 * data against Schema.org and each active reader, each finding naming its
 * reader and the documentation it cites; with the active readers' names.
 */
export const seoFindings: ApiHandler = async (req, ctx) => {
  const target = documentTarget(req, ctx)
  if (!target.ok) return target.response
  try {
    const findings = await validateDocumentSeo(ctx, target.collection, target.slug, target.locale)
    return { status: 200, body: { findings, readers: await activeReaders(ctx) } }
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return { status: 404, body: { error: err.message } }
    throw err
  }
}

/**
 * GET /api/seo/findings — the SEO of every published page in the site's
 * default locale (viewer): each page's findings counted per reader and the
 * search features of the active readers its entities can appear in, with the
 * active readers' names. A feature a reader has retired is never listed.
 */
export const seoSiteFindings: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'viewer')
  if (denied) return denied
  try {
    const pages = await siteSeoSummary(ctx)
    return { status: 200, body: { pages, readers: await activeReaders(ctx) } }
  } catch (err) {
    if (!isSeoModuleMissing(err)) throw err
    return { status: 501, body: { error: 'Site findings need the @krantho/seo package' } }
  }
}
