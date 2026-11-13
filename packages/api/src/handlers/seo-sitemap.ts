import { documentPath, rendersPages } from '@krantho/core'
import { canReadPublished } from '@krantho/persistence'
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import { PUBLIC_MACHINE_READ_CACHE_CONTROL } from '../public-cache.js'
import type { ApiHandler, SeoFileSource } from '../types.js'

/**
 * Canonical paths for the SEO routes registered in `create-api-handlers.ts`.
 *
 * Exported as constants so callers (e.g., the robots.txt handler) reference
 * the same path the router registers, preventing drift if a route is renamed.
 */
export const SEO_SITEMAP_PATH = '/api/seo/sitemap'
/** Where a site serves the sitemap — the address robots.txt names; the site routes it to SEO_SITEMAP_PATH */
export const SITEMAP_PUBLIC_PATH = '/sitemap.xml'
export const SEO_SITEMAP_JSON_PATH = '/api/seo/sitemap.json'
export const SEO_ROBOTS_PATH = '/api/seo/robots.txt'

/** A single URL entry in the sitemap output */
export interface SitemapUrl {
  loc: string
  /** When the page last changed, as a W3C Datetime in UTC (`2026-09-30T22:17:06.000Z`) */
  lastmod?: string | undefined
  changefreq: string
  priority: string
}

/**
 * Whether a document asks not to be indexed. The field name is resolved
 * dynamically so CMS schemas with different conventions (e.g. `robots-index`
 * vs `noindex`) all work.
 */
export function isNoindex(fields: Record<string, unknown>): boolean {
  const fieldMap = buildSeoFieldMap(Object.keys(fields))
  const robotsField = fieldMap.robotsIndex
  if (!robotsField) return false
  const rawValue = fields[robotsField]
  if (rawValue === false || rawValue === 'false' || rawValue === 'noindex') return true
  // resolveSeoField returns strings; the raw false/string cases are handled above
  const resolved = resolveSeoField(fieldMap, 'robotsIndex', fields)
  return resolved === 'false' || resolved === 'noindex'
}

/**
 * Build the list of sitemap URLs from the handler's content config.
 *
 * Pure: reads from the source, returns an array. No side effects. This is
 * the shared core used by both `seoSitemap` (XML output) and `seoSitemapJson`
 * (JSON output for the Studio preview), plus any future consumer that needs
 * the url list.
 *
 * Iterates every published item in every collection that renders pages
 * (`rendersPages()`), skips noindex pages (resolved via the dynamic field map
 * so CMS field names can differ), and derives the URL with `documentPath()`
 * from the collection's `path` — or, without one, `pages` items at the site
 * root (the `home` page is the homepage) and other collections under their
 * name (`/{name}/slug`). A path is listed once: the homepage, and a fixed-path
 * collection whose documents share one page.
 */
export async function buildSitemapUrls(ctx: SeoFileSource): Promise<SitemapUrl[]> {
  const baseUrl = ctx.config.site.baseUrl.replace(/\/$/, '')
  const urls: SitemapUrl[] = []
  const listed = new Set<string>()

  for (const [name, collection] of ctx.contentConfig.collections) {
    if (!rendersPages(collection)) continue
    if (!canReadPublished(ctx.adapter)) continue

    try {
      // The live version of each document: a page with a newer draft stays
      // listed, and an unpublished page drops out
      const { items } = await ctx.adapter.query({
        state: 'published',
        projection: 'summary',
        collections: [name],
      })

      for (const item of items) {
        if (isNoindex(item.fields)) continue

        const path = documentPath(collection, item.meta.slug)
        if (path === null || listed.has(path)) continue
        listed.add(path)
        // Each save writes a new version, so the live version's `createdAt` is
        // when the page last changed: an editor's publish, or for an imported
        // file its last commit (`generateContentDates`)
        const lastmod = w3cDatetime(item.meta.createdAt)

        const home = path === '/'
        urls.push({
          loc: `${baseUrl}${path}`,
          ...(lastmod ? { lastmod } : {}),
          changefreq: home || name === 'pages' ? 'weekly' : 'monthly',
          priority: home ? '1.0' : name === 'pages' ? '0.8' : '0.6',
        })
      }
    } catch {
      // Collection may not support listing
    }
  }

  return withHomepageFirst(urls, baseUrl)
}

/**
 * A timestamp as the sitemap protocol's W3C Datetime, in UTC with full time
 * (`2026-09-30T22:17:06.000Z`), or undefined when there is none to give.
 */
function w3cDatetime(value: string | undefined): string | undefined {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

/**
 * The homepage leads the list. A document that renders `/` supplies its entry,
 * with its `lastmod`; without one, the site's root is listed bare.
 */
function withHomepageFirst(urls: SitemapUrl[], baseUrl: string): SitemapUrl[] {
  const homeLoc = `${baseUrl}/`
  const home = urls.find((url) => url.loc === homeLoc) ?? {
    loc: homeLoc,
    changefreq: 'weekly',
    priority: '1.0',
  }
  return [home, ...urls.filter((url) => url.loc !== homeLoc)]
}

/**
 * Serialize a list of sitemap URLs to XML.
 *
 * Exported so tests can drive the serializer directly without needing to
 * stub the full ApiContext. Also used by the XML handler below.
 */
export function serializeSitemapXml(urls: readonly SitemapUrl[]): string {
  const urlEntries = urls
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`]
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`)
      parts.push(`    <changefreq>${u.changefreq}</changefreq>`)
      parts.push(`    <priority>${u.priority}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`
}

/**
 * GET /api/seo/sitemap — generate sitemap XML dynamically from all collections.
 *
 * Lists all published content across the collections that render pages, at
 * site.baseUrl + `documentPath()`. Excludes collections without pages and
 * noindex pages.
 */
export const seoSitemap: ApiHandler = async (_req, ctx) => {
  const urls = await buildSitemapUrls(ctx)
  return {
    status: 200,
    body: serializeSitemapXml(urls),
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': PUBLIC_MACHINE_READ_CACHE_CONTROL,
    },
  }
}

/**
 * GET /api/seo/sitemap.json — same url list as the XML handler, served as JSON.
 *
 * Used by Studio's Structure → Sitemap & Robots tab to render a sortable table
 * without parsing XML client-side. Not intended as a public SEO endpoint —
 * search engines consume the XML at `/api/seo/sitemap` (or wherever your
 * framework rewrites it, e.g. `/sitemap.xml`).
 */
export const seoSitemapJson: ApiHandler = async (_req, ctx) => {
  const urls = await buildSitemapUrls(ctx)
  return {
    status: 200,
    body: { urls },
  }
}

/**
 * Escape XML special characters for use inside `<loc>` element values.
 *
 * Intentionally minimal: only escapes the three characters that XML treats
 * as control characters in element content (`&`, `<`, `>`). Quote characters
 * (`'` and `"`) are not escaped because we never embed values inside attribute
 * contexts in this sitemap output — every interpolated value goes between
 * element tags. If you start emitting values inside attributes (e.g.
 * `<image:image href="...">`), extend this to also escape `'` and `"`.
 */
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
