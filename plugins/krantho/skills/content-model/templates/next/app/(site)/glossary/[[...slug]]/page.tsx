import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { kranthoField } from '@krantho/core/marks'
import { getAllCMSContent, resolveSeoContent } from '@krantho/ui-react/server'
import { type Doc, jsonLd, maybe, text } from '@/lib/content'

// Every term on one page at /glossary, alphabetically, each with an anchor.
// An optional catch-all keeps the ISR route shape: the build reads nothing, and
// /glossary/<anything> is not found (entries have no page of their own).
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] | undefined }>
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('pages', 'glossary')
  return { title: seo.title, description: seo.description }
}

async function terms(): Promise<Doc[]> {
  const docs = await getAllCMSContent('glossary')
  return [...docs].sort((a, b) => text(a, 'title').localeCompare(text(b, 'title')))
}

export default async function Glossary({ params }: Props): Promise<React.ReactElement> {
  if ((await params).slug !== undefined) notFound()
  const [intro, entries] = await Promise.all([maybe('pages', 'glossary'), terms()])
  const docsPages = await Promise.all(
    entries.map((entry) => maybe('docs', text(entry, 'docs-page'))),
  )
  // DefinedTermSet structured data: one DefinedTerm per entry
  const data = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: text(intro, 'title') || 'Glossary',
    hasDefinedTerm: entries.map((entry) => ({
      '@type': 'DefinedTerm',
      name: text(entry, 'title'),
      description: text(entry, 'definition'),
    })),
  }
  return (
    <>
      <h1 {...kranthoField(intro, 'title')}>{text(intro, 'title') || 'Glossary'}</h1>
      {intro && (
        <p className="lead" {...kranthoField(intro, 'description')}>
          {text(intro, 'description')}
        </p>
      )}
      <dl className="glossary">
        {entries.map((entry, index) => {
          const docsPage = docsPages[index]
          return (
            <div key={entry.slug} id={entry.slug}>
              <dt {...kranthoField(entry, 'title')}>{text(entry, 'title')}</dt>
              <dd>
                <span {...kranthoField(entry, 'definition')}>{text(entry, 'definition')}</span>
                {docsPage && (
                  <>
                    {' '}
                    <Link href={`/docs/${docsPage.slug}`}>{text(docsPage, 'title')}</Link>
                  </>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
    </>
  )
}
