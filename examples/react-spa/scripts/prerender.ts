/**
 * Build-time pre-renderer — generates static HTML per route with SEO.
 * Run after vite build: produces index.html per route in dist/.
 * Crawlers see full content + meta tags + JSON-LD.
 * The SPA hydrates on top for client-side interactivity.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), 'dist')
const CONTENT_JSON = join(process.cwd(), 'public', 'content', 'json')
const CONTENT_SEO = join(process.cwd(), '..', 'content', 'seo')

// Load site config
const siteConfig = JSON.parse(readFileSync(join(CONTENT_SEO, 'site-config.json'), 'utf-8'))
const domain = siteConfig.domain as string
const siteUrl = `https://${domain}`
const routeToSlug = siteConfig.routeToSlug as Record<string, string>

// Load structured data
const structuredDataPath = join(CONTENT_SEO, 'generated', 'structured-data.json')
const structuredData = existsSync(structuredDataPath)
  ? JSON.parse(readFileSync(structuredDataPath, 'utf-8'))
  : null

// Load FAQ data
const faqPath = join(CONTENT_SEO, 'generated', 'faq-pages.json')
const faqPages = existsSync(faqPath)
  ? JSON.parse(readFileSync(faqPath, 'utf-8'))
  : null

function loadContent(slug: string): Record<string, unknown> {
  const filePath = join(CONTENT_JSON, `${slug}.json`)
  if (!existsSync(filePath)) return { fields: {}, html: '', sections: {} }
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function jsonLdTag(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function buildBreadcrumbs(pathname: string): Record<string, unknown> | null {
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

function slugForRoute(route: string): string {
  if (route.startsWith('/services/')) return route.slice('/services/'.length)
  return routeToSlug[route] ?? 'home'
}

function generateHeadForRoute(route: string): string {
  const slug = slugForRoute(route)
  const content = loadContent(slug)
  const fm = content.fields as Record<string, string>
  const siteFm = loadContent('navigation').fields as Record<string, string>

  const parts: string[] = []

  // Meta tags
  const title = fm['title'] ?? siteFm['site-title'] ?? ''
  const description = fm['description'] ?? siteFm['site-description'] ?? ''
  parts.push(`<title>${escapeHtml(title)}</title>`)
  parts.push(`<meta name="description" content="${escapeHtml(description)}" />`)
  parts.push(`<meta property="og:title" content="${escapeHtml(title)}" />`)
  parts.push(`<meta property="og:description" content="${escapeHtml(description)}" />`)
  parts.push(`<meta property="og:type" content="website" />`)
  parts.push(`<meta property="og:url" content="${siteUrl}${route}" />`)

  // Structured data
  if (structuredData) {
    for (const entity of Object.values(structuredData) as Record<string, unknown>[]) {
      parts.push(jsonLdTag(entity))
    }
  }

  // Breadcrumbs
  const breadcrumbs = buildBreadcrumbs(route)
  if (breadcrumbs) parts.push(jsonLdTag(breadcrumbs))

  // FAQ schema
  if (faqPages) {
    const faqItems = faqPages[route]
    if (faqItems?.length > 0) {
      parts.push(jsonLdTag({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems }))
    }
  }

  return parts.join('\n    ')
}

// Read the built index.html template
const template = readFileSync(join(DIST, 'index.html'), 'utf-8')

// Pre-render each route — the static routes plus a detail page per service.
const serviceIds = (siteConfig.serviceIds ?? []) as string[]
const routes = [...Object.keys(routeToSlug), ...serviceIds.map((id) => `/services/${id}`)]

for (const route of routes) {
  const seoHead = generateHeadForRoute(route)

  // Inject SEO head before </head>
  const html = template.replace('</head>', `    ${seoHead}\n  </head>`)

  if (route === '/') {
    // Overwrite root index.html
    writeFileSync(join(DIST, 'index.html'), html)
    console.log(`[Prerender] / → index.html`)
  } else {
    // Create directory and index.html for clean URLs
    const dir = join(DIST, route.slice(1))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), html)
    console.log(`[Prerender] ${route} → ${route.slice(1)}/index.html`)
  }
}

console.log(`[Prerender] ${routes.length} routes pre-rendered with SEO`)
