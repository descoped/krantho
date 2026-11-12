import ReactDOMServer from 'react-dom/server'
import { CMSProvider, CMSContentProvider } from '@krantho/ui-react'
import type { ContentData } from '@krantho/core'
import { resolveConfig } from '@krantho/config'
import config from '../krantho.config'
import { AppShell, NotFoundPage, listsServices, routeFor } from './App'
import type { PageRoute } from './App'
import { loadContent, loadJsonLd, loadSummaries } from './lib/cms'
import type { PageContent } from './lib/cms'
import { loadSeoJson } from './lib/seo'

const { site } = resolveConfig(config, process.env)

export interface RenderResult {
  status: number
  html: string
  head: string
}

/** Everything a page reads from the database */
interface PageData {
  page: PageContent | null
  globals: Array<PageContent | null>
  services: PageContent[]
  jsonLd: Record<string, unknown> | null
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function jsonScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function jsonLdTag(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${jsonScript(data)}</script>`
}

function buildBreadcrumbs(pathname: string, siteUrl: string): Record<string, unknown> | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: segments.map((segment, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
      item: `${siteUrl}/${segments.slice(0, index + 1).join('/')}`,
    })),
  }
}

/** Every read starts here, inside the page request, so each one records its cache tags */
async function readPage(pathname: string, route: PageRoute | null): Promise<PageData> {
  const [page, globals, services, jsonLd] = await Promise.all([
    route ? loadContent(route.collection, route.slug) : null,
    Promise.all(['navigation', 'footer', 'contact-info'].map((slug) => loadContent('globals', slug))),
    listsServices(pathname) ? loadSummaries('services') : [],
    route ? loadJsonLd(route.collection, route.slug) : null,
  ])
  return { page, globals, services, jsonLd }
}

/** What the client hydrates from: the content the page rendered, its services, and whether it was found */
interface Hydration {
  contentCache: Record<string, ContentData>
  serviceIds: string[]
  found: boolean
}

function headTags(pathname: string, data: PageData, hydration: Hydration): string {
  const siteUrl = site.baseUrl.replace(/\/$/, '')
  const fields = data.page?.data.fields ?? {}
  const title = (fields['title'] as string | undefined) ?? 'Page not found'
  const description = (fields['description'] as string | undefined) ?? ''
  const headParts = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(`${siteUrl}${pathname}`)}" />`,
  ]

  const structuredData = loadSeoJson<Record<string, Record<string, unknown>>>('structured-data.json')
  for (const entity of Object.values(structuredData ?? {})) headParts.push(jsonLdTag(entity))
  if (data.jsonLd) headParts.push(jsonLdTag(data.jsonLd))

  const breadcrumbs = buildBreadcrumbs(pathname, siteUrl)
  if (breadcrumbs) headParts.push(jsonLdTag(breadcrumbs))

  const faqItems = loadSeoJson<Record<string, unknown[]>>('faq-pages.json')?.[pathname]
  if (faqItems && faqItems.length > 0) {
    headParts.push(jsonLdTag({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems }))
  }

  headParts.push(`<script>window.__CMS_CACHE__ = ${jsonScript(hydration.contentCache)}</script>`)
  headParts.push(`<script>window.__SERVICE_IDS__ = ${jsonScript(hydration.serviceIds)}</script>`)
  headParts.push(`<script>window.__PAGE_FOUND__ = ${jsonScript(hydration.found)}</script>`)
  return headParts.join('\n    ')
}

/**
 * Render one page from the published content in the database.
 *
 * `url` is the request path with its query string. A path no page answers, or
 * a document with no published version, renders the not-found page with 404.
 */
export async function render(url: string): Promise<RenderResult> {
  const { pathname } = new URL(`http://localhost${url}`)
  const route = routeFor(pathname)
  const data = await readPage(pathname, route)

  const contentCache: Record<string, ContentData> = {}
  for (const doc of [...data.globals, data.page, ...data.services]) {
    if (doc) contentCache[doc.slug] = doc.data
  }
  const serviceIds = data.services.map((service) => service.slug)
  // The header/footer need keys spread across three globals.
  const siteFm = Object.assign({}, ...data.globals.map((doc) => doc?.data.fields ?? {})) as Record<string, string>

  const found = route !== null && data.page !== null
  const appHtml = ReactDOMServer.renderToString(
    <CMSProvider config={{ contentPath: '/api/content' }}>
      <CMSContentProvider data={contentCache}>
        <AppShell siteFm={siteFm}>
          {found ? <route.Page slug={route.slug} serviceIds={serviceIds} /> : <NotFoundPage />}
        </AppShell>
      </CMSContentProvider>
    </CMSProvider>,
  )

  const head = headTags(pathname, data, { contentCache, serviceIds, found })
  return { status: found ? 200 : 404, html: appHtml, head }
}
