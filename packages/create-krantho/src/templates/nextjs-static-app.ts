import { staticCss } from './static-css.js'

/** The App Router files of the static docs site: its layout, pages, SEO files and styles */
export function generateStaticAppFiles(): Map<string, string> {
  return new Map([
    ['app/layout.tsx', rootLayout()],
    ['app/page.tsx', homePage()],
    ['app/[slug]/page.tsx', docRoute()],
    ['app/not-found.tsx', notFound()],
    ['app/sitemap.xml/route.ts', fileRoute('sitemapXml', 'application/xml')],
    ['app/llms.txt/route.ts', fileRoute('llmsTxt', 'text/plain')],
    ['app/robots.txt/route.ts', fileRoute('robotsTxt', 'text/plain')],
    ['components/doc-page.tsx', docPage()],
    ['app/globals.css', staticCss()],
  ])
}

function rootLayout(): string {
  return `import type { Metadata } from 'next'
import Link from 'next/link'
import { docLinks, site } from '../lib/krantho'
import './globals.css'

const { name, description, baseUrl } = site.config.site

export const metadata: Metadata = {
  // Absolute URLs (canonical, Open Graph) start at the site's address, path included
  metadataBase: new URL(\`\${baseUrl.replace(/\\/$/, '')}/\`),
  title: { default: name, template: \`%s — \${name}\` },
  description,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  const links = await docLinks()
  const groups = [...new Set(links.map((link) => link.group))]
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="site-name">
            {name}
          </Link>
        </header>
        <div className="site-body">
          <nav className="sidebar" aria-label="Documentation">
            {groups.map((group) => (
              <section key={group}>
                {group && <h2>{group}</h2>}
                <ul>
                  {links
                    .filter((link) => link.group === group)
                    .map((link) => (
                      <li key={link.slug}>
                        <Link href={link.href}>{link.title}</Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
`
}

function homePage(): string {
  return `import type { Metadata } from 'next'
import { DocPage, docMetadata } from '../components/doc-page'

// content/docs/index.md
export function generateMetadata(): Promise<Metadata> {
  return docMetadata('index')
}

export default function Home(): Promise<React.ReactElement> {
  return DocPage({ slug: 'index' })
}
`
}

function docRoute(): string {
  return `import type { Metadata } from 'next'
import { DocPage, docMetadata } from '../../components/doc-page'
import { site } from '../../lib/krantho'

// One page for each published file in content/docs; any other address is not found
export const dynamicParams = false

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await site.params('docs')).filter((page) => page.slug !== 'index')
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return docMetadata((await params).slug)
}

export default async function Doc({ params }: Props): Promise<React.ReactElement> {
  return DocPage({ slug: (await params).slug })
}
`
}

function docPage(): string {
  return `import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CMSMarkdownServer, resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { docHref, docLinks, site } from '../lib/krantho'

/** A docs page's title, description and canonical address */
export async function docMetadata(slug: string): Promise<Metadata> {
  const seo = await resolveSeoContent('docs', slug)
  return {
    title: slug === 'index' ? { absolute: seo.title } : seo.title,
    description: seo.description,
    alternates: { canonical: docHref(slug) },
    openGraph: { title: seo.title, description: seo.description, url: docHref(slug) },
  }
}

/** A docs page: its title, description, markdown body and the pages before and after it */
export async function DocPage({ slug }: { slug: string }): Promise<React.ReactElement> {
  const doc = await site.loader.getPublished({ collection: 'docs', slug })
  if (!doc) notFound()
  const links = await docLinks()
  const at = links.findIndex((link) => link.slug === slug)
  const previous = at > 0 ? links[at - 1] : undefined
  const next = at >= 0 ? links[at + 1] : undefined
  return (
    <article className="doc">
      <SeoJsonLd collection="docs" slug={slug} />
      <h1>{String(doc.fields.title)}</h1>
      <p className="lead">{String(doc.fields.description)}</p>
      <CMSMarkdownServer collection="docs" slug={slug} className="prose" />
      <nav className="pager" aria-label="Pages">
        {previous && (
          <Link href={previous.href} rel="prev">
            ← {previous.title}
          </Link>
        )}
        {next && (
          <Link href={next.href} rel="next">
            {next.title} →
          </Link>
        )}
      </nav>
    </article>
  )
}
`
}

function notFound(): string {
  return `import Link from 'next/link'

// 404.html: GitHub Pages serves it for an address the site has no page for
export default function NotFound(): React.ReactElement {
  return (
    <article className="doc">
      <h1>Page not found</h1>
      <p className="lead">There is no page at this address.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </article>
  )
}
`
}

/** A file the build writes from the site's content: the sitemap, llms.txt or robots.txt */
function fileRoute(method: 'sitemapXml' | 'llmsTxt' | 'robotsTxt', type: string): string {
  return `import { site } from '../../lib/krantho'

// Written once at build, from the published pages
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return new Response(await site.${method}(), {
    headers: { 'content-type': '${type}; charset=utf-8' },
  })
}
`
}
