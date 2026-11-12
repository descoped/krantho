import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { kranthoField, kranthoSection, markBodySections } from '@krantho/core/marks'
import { resolveSeoContent, SeoJsonLd } from '@krantho/ui-react/server'
import { Faq } from '@/components/faq'
import { Html } from '@/components/html'
import { all, type Doc, page, text } from '@/lib/content'

// `/` renders the landing singleton (landing/home), `/<slug>` a standalone page
// (pages/<slug>). Rendered on first request and cached until Studio changes
// what it shows (`cache.pages: 'next-isr'`); the build reads nothing. Every
// field and section a template renders carries its Live marks (kranthoField,
// kranthoSection), which appear only in an editor's preview.
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] | undefined }>
}

type Target = { collection: 'landing'; slug: 'home' } | { collection: 'pages'; slug: string }

async function target({ params }: Props): Promise<Target> {
  const { slug } = await params
  if (slug === undefined) return { collection: 'landing', slug: 'home' }
  const [name] = slug
  // pages/home is not a second home page
  if (slug.length !== 1 || !name || name === 'home') notFound()
  return { collection: 'pages', slug: name }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { collection, slug } = await target(props)
  const seo = await resolveSeoContent(collection, slug)
  return { title: seo.title, description: seo.description }
}

export default async function Page(props: Props): Promise<React.ReactElement> {
  const { collection, slug } = await target(props)
  const doc = await page(collection, slug)
  return (
    <>
      <SeoJsonLd collection={collection} slug={slug} />
      {collection === 'landing' ? <Landing doc={doc} /> : <Standalone doc={doc} />}
    </>
  )
}

/** The sections the landing collection declares (`sections`): "## Problem" and "## Fit" */
async function Landing({ doc }: { doc: Doc }): Promise<React.ReactElement> {
  const [features, faq] = await Promise.all([all('features'), all('faq')])
  const secondary = text(doc, 'secondary-label')
  return (
    <>
      <header className="hero">
        {text(doc, 'eyebrow') && (
          <p className="eyebrow" {...kranthoField(doc, 'eyebrow')}>
            {text(doc, 'eyebrow')}
          </p>
        )}
        <h1 {...kranthoField(doc, 'headline')}>{text(doc, 'headline')}</h1>
        <p className="subline" {...kranthoField(doc, 'subline')}>
          {text(doc, 'subline')}
        </p>
        <p className="actions">
          <Link className="button primary" href={text(doc, 'primary-href')}>
            {text(doc, 'primary-label')}
          </Link>
          {secondary && (
            <Link className="button" href={text(doc, 'secondary-href')}>
              {secondary}
            </Link>
          )}
        </p>
      </header>

      <Html html={doc.sections['Problem']} as="section" marks={kranthoSection(doc, 'Problem')} />

      {features.length > 0 && (
        <section aria-labelledby="features-heading">
          {/* Move headings like this into landing fields when editors should change them */}
          <h2 id="features-heading">Features</h2>
          <ul className="cards">
            {features.map((feature) => (
              <li key={feature.slug} className="card">
                {/* A card marks its own document's fields, not the landing page's */}
                <h3 {...kranthoField(feature, 'title')}>
                  <Link href={`/features/${feature.slug}`}>{text(feature, 'title')}</Link>
                </h3>
                <p {...kranthoField(feature, 'benefit')}>{text(feature, 'benefit')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Html html={doc.sections['Fit']} as="section" marks={kranthoSection(doc, 'Fit')} />

      <Faq entries={faq} heading="Questions" />
    </>
  )
}

function Standalone({ doc }: { doc: Doc }): React.ReactElement {
  return (
    <article>
      <h1 {...kranthoField(doc, 'title')}>{text(doc, 'title')}</h1>
      <p className="lead" {...kranthoField(doc, 'description')}>
        {text(doc, 'description')}
      </p>
      {/* The lead and each ## section of the body, marked in a preview */}
      <Html html={markBodySections(doc.html, doc.rawContent, doc)} />
    </article>
  )
}
