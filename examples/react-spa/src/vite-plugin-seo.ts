/**
 * Vite plugin that injects SEO tags into index.html per route.
 * Works in both dev and build. For production, prerender.ts adds
 * route-specific HTML files; this plugin handles the dev server.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, HtmlTagDescriptor } from 'vite'

interface SeoPluginOptions {
  contentSeoDir?: string
  contentJsonDir?: string
}

interface SiteConfig {
  domain: string
  routeToSlug: Record<string, string>
}

function loadConfig(contentSeoDir: string): SiteConfig | null {
  try {
    return JSON.parse(
      readFileSync(join(contentSeoDir, 'site-config.json'), 'utf-8'),
    ) as SiteConfig
  } catch {
    return null
  }
}

function loadPageFrontmatter(
  slug: string,
  contentJsonDir: string,
): { fm: Record<string, string>; siteFm: Record<string, string> } {
  let fm: Record<string, string> = {}
  let siteFm: Record<string, string> = {}
  try {
    fm = JSON.parse(
      readFileSync(join(contentJsonDir, `${slug}.json`), 'utf-8'),
    ).fields
    siteFm = JSON.parse(
      readFileSync(join(contentJsonDir, 'navigation.json'), 'utf-8'),
    ).fields
  } catch {
    /* not yet generated */
  }
  return { fm, siteFm }
}

function buildMetaTags(
  fm: Record<string, string>,
  siteFm: Record<string, string>,
  siteUrl: string,
  path: string,
): HtmlTagDescriptor[] {
  const tags: HtmlTagDescriptor[] = []

  const title = fm['title'] ?? siteFm['site-title'] ?? ''
  if (title) {
    tags.push({ tag: 'title', children: title, injectTo: 'head' })
    tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' })
  }

  const desc = fm['description'] ?? ''
  if (desc) {
    tags.push({
      tag: 'meta',
      attrs: { name: 'description', content: desc },
      injectTo: 'head',
    })
    tags.push({ tag: 'meta', attrs: { property: 'og:description', content: desc }, injectTo: 'head' })
  }

  tags.push({ tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' })
  tags.push({ tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}${path}` }, injectTo: 'head' })

  return tags
}

function buildStructuredData(
  contentSeoDir: string,
): HtmlTagDescriptor[] {
  const sdPath = join(contentSeoDir, 'generated', 'structured-data.json')
  if (!existsSync(sdPath)) return []

  const sd = JSON.parse(readFileSync(sdPath, 'utf-8'))
  return (Object.values(sd) as Record<string, unknown>[]).map((entity) => ({
    tag: 'script' as const,
    attrs: { type: 'application/ld+json' },
    children: JSON.stringify(entity).replace(/</g, '\\u003c'),
    injectTo: 'head' as const,
  }))
}

function buildBreadcrumbs(
  url: string,
  siteUrl: string,
): HtmlTagDescriptor[] {
  const segments = url.split('/').filter(Boolean)
  if (segments.length === 0) return []

  return [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: segments.map((seg, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
          item: `${siteUrl}/${segments.slice(0, i + 1).join('/')}`,
        })),
      }).replace(/</g, '\\u003c'),
      injectTo: 'head',
    },
  ]
}

function buildFaqSchema(
  url: string,
  contentSeoDir: string,
): HtmlTagDescriptor[] {
  const faqPath = join(contentSeoDir, 'generated', 'faq-pages.json')
  if (!existsSync(faqPath)) return []

  const faq = JSON.parse(readFileSync(faqPath, 'utf-8'))
  const items = faq[url]
  if (!items?.length) return []

  return [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items,
      }).replace(/</g, '\\u003c'),
      injectTo: 'head',
    },
  ]
}

export function seoPlugin(options?: SeoPluginOptions): Plugin {
  const contentSeoDir =
    options?.contentSeoDir ?? join(process.cwd(), '..', 'content', 'seo')
  const contentJsonDir =
    options?.contentJsonDir ?? join(process.cwd(), 'public', 'content', 'json')

  return {
    name: 'krantho-seo',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const url = (ctx.originalUrl ?? ctx.path ?? '/').split('?')[0]

        const config = loadConfig(contentSeoDir)
        if (!config) return []

        const siteUrl = `https://${config.domain}`
        const slug = config.routeToSlug[url] ?? 'home'
        const { fm, siteFm } = loadPageFrontmatter(slug, contentJsonDir)

        return [
          ...buildMetaTags(fm, siteFm, siteUrl, url),
          ...buildStructuredData(contentSeoDir),
          ...buildBreadcrumbs(url, siteUrl),
          ...buildFaqSchema(url, contentSeoDir),
        ]
      },
    },
  }
}
