import Link from 'next/link'
import { kranthoField, markBodySections } from '@krantho/core/marks'
import { type Doc, jsonLd, maybe, text } from '@/lib/content'
import { Html } from './html'

/** Plain text of rendered HTML, for structured data */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * FAQ entries as native disclosures, with FAQPage structured data. The title
 * is the question, the body the answer; `docs-page` links to the page that
 * explains more. Renders nothing without entries.
 */
export async function Faq({
  entries,
  heading,
}: {
  entries: Doc[]
  heading: string
}): Promise<React.ReactElement | null> {
  if (entries.length === 0) return null
  // A reference whose target is unpublished renders no link
  const docsPages = await Promise.all(
    entries.map((entry) => maybe('docs', text(entry, 'docs-page'))),
  )
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: text(entry, 'title'),
      acceptedAnswer: { '@type': 'Answer', text: plain(entry.html) },
    })),
  }
  return (
    <section aria-labelledby="faq-heading" className="faq">
      <h2 id="faq-heading">{heading}</h2>
      {entries.map((entry, index) => {
        const docsPage = docsPages[index]
        return (
          <details key={entry.slug}>
            <summary {...kranthoField(entry, 'title')}>{text(entry, 'title')}</summary>
            <Html html={markBodySections(entry.html, entry.rawContent, entry)} />
            {docsPage && (
              <p>
                <Link href={`/docs/${docsPage.slug}`}>{text(docsPage, 'title')}</Link>
              </p>
            )}
          </details>
        )
      })}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
    </section>
  )
}
