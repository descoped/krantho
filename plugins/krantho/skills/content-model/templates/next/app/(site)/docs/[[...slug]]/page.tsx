import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { kranthoField } from '@krantho/core/marks'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { BodyWithSamples } from '@/components/sample'
import { all, type Doc, list, maybe, page, text } from '@/lib/content'

// `/docs` is the index, `/docs/<slug>` a page. Docs URLs are flat; the sidebar
// groups pages by `area` and orders them by `order`. Cached until Studio
// changes what a page shows.
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

/** Areas in sidebar order, with the labels visitors see */
const AREAS = [
  ['get-started', 'Get started'],
  ['concepts', 'Concepts'],
  ['guides', 'Guides'],
  ['reference', 'Reference'],
] as const

interface Props {
  params: Promise<{ slug?: string[] | undefined }>
}

async function docSlug({ params }: Props): Promise<string | null> {
  const { slug } = await params
  if (slug === undefined) return null
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  return name
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const slug = await docSlug(props)
  const seo = await resolveSeoContent(slug === null ? 'pages' : 'docs', slug ?? 'docs')
  return { title: seo.title, description: seo.description }
}

export default async function Docs(props: Props): Promise<React.ReactElement> {
  const slug = await docSlug(props)
  const docs = await all('docs')
  return (
    <div className="docs">
      <Sidebar docs={docs} current={slug} />
      {/* The site layout owns <main>; this is the column beside the sidebar */}
      <div className="docs-content">
        {slug === null ? <Index docs={docs} /> : <DocPage slug={slug} />}
      </div>
    </div>
  )
}

function Sidebar({ docs, current }: { docs: Doc[]; current: string | null }): React.ReactElement {
  return (
    <nav aria-label="Documentation" className="docs-sidebar">
      {AREAS.map(([area, label]) => {
        const pages = docs.filter((doc) => text(doc, 'area') === area)
        if (pages.length === 0) return null
        return (
          <section key={area}>
            <h2>{label}</h2>
            <ul>
              {pages.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/docs/${doc.slug}`}
                    aria-current={doc.slug === current ? 'page' : undefined}
                  >
                    {text(doc, 'title')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}

async function Index({ docs }: { docs: Doc[] }): Promise<React.ReactElement> {
  const intro = await maybe('pages', 'docs')
  const start = docs.find((doc) => text(doc, 'area') === 'get-started')
  return (
    <>
      <h1 {...kranthoField(intro, 'title')}>{text(intro, 'title') || 'Documentation'}</h1>
      {intro && (
        <p className="lead" {...kranthoField(intro, 'description')}>
          {text(intro, 'description')}
        </p>
      )}
      {start && (
        <p>
          <Link href={`/docs/${start.slug}`}>Start with {text(start, 'title')}</Link>
        </p>
      )}
    </>
  )
}

/** Links to other docs pages named in a slug-list field; unpublished ones are left out */
async function DocLinks({ doc, field, label }: { doc: Doc; field: string; label: string }) {
  const targets = (await Promise.all(list(doc, field).map((slug) => maybe('docs', slug)))).filter(
    (target): target is Doc => target !== undefined,
  )
  if (targets.length === 0) return null
  return (
    <nav aria-label={label} className={`docs-links docs-${field}`}>
      <h2>{label}</h2>
      <ul>
        {targets.map((target) => (
          <li key={target.slug}>
            <Link href={`/docs/${target.slug}`}>{text(target, 'title')}</Link>
            <span> — {text(target, 'description')}</span>
          </li>
        ))}
      </ul>
    </nav>
  )
}

async function DocPage({ slug }: { slug: string }): Promise<React.ReactElement> {
  const doc = await page('docs', slug)
  return (
    <article>
      <SeoJsonLd collection="docs" slug={slug} />
      <h1 {...kranthoField(doc, 'title')}>{text(doc, 'title')}</h1>
      <p className="lead" {...kranthoField(doc, 'description')}>
        {text(doc, 'description')}
      </p>
      <DocLinks doc={doc} field="prerequisites" label="Before you start" />
      {/* Samples split the body's HTML, so its sections are not marked here; to
          mark them, render the body section by section with kranthoSection */}
      <BodyWithSamples html={doc.html} />
      <DocLinks doc={doc} field="next" label="Next" />
      <DocLinks doc={doc} field="related" label="Related" />
    </article>
  )
}
