import { kranthoField, markBodySections } from '@krantho/core/marks'
import Link from 'next/link'
import { type Doc, text } from '../../lib/content'
import { routeOf } from '../../lib/routes'
import { Html, render } from './markdown'
import '../styles/page.css'

// Questions and answers from the faq collection: a native <details> list (no
// client JavaScript) and the FAQPage structured data for the same entries, so
// what a visitor reads and what a search engine reads cannot drift apart. Used
// on the landing page and on docs pages.

/** An answer as plain text for the Answer entity: no markup, no control labels */
function plainText(html: string): string {
  return html
    .replace(/<button[\s\S]*?<\/button>/g, ' ')
    .replace(/<a class="heading-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s([.,;:!?])/g, '$1')
    .trim()
}

/** Inline JSON-LD: `<` escaped so a value can never close the script element */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export async function Faq({
  items,
  id = 'faq',
  heading,
  linkDocs = true,
}: {
  /** faq documents, in the order to show them */
  items: Doc[]
  /** The block's anchor; each question is `<id>-<slug>` */
  id?: string
  /** An <h2> above the list, when the page has no heading of its own for it */
  heading?: string
  /** Link each answer to its docs page, when it names one */
  linkDocs?: boolean
}): Promise<React.ReactElement | null> {
  if (items.length === 0) return null
  const answers = await Promise.all(items.map((item) => render(item.rawContent)))
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item, index) => ({
      '@type': 'Question',
      name: text(item, 'title'),
      acceptedAnswer: { '@type': 'Answer', text: plainText(answers[index]?.html ?? '') },
    })),
  }

  return (
    <div className="faq" id={id}>
      {heading && <h2 className="faq__heading">{heading}</h2>}
      <div className="faq__list">
        {items.map((item, index) => {
          const docsPage = text(item, 'docs-page')
          return (
            <details key={item.slug} className="faq__item" id={`${id}-${item.slug}`}>
              <summary className="faq__question">
                <span {...kranthoField(item, 'title')}>{text(item, 'title')}</span>
                <span className="faq__toggle" aria-hidden="true" />
              </summary>
              <div className="faq__answer">
                <Html html={markBodySections(answers[index]?.html ?? '', item.rawContent, item)} className="prose faq__prose" />
                {linkDocs && docsPage && (
                  <Link href={routeOf('docs', docsPage)} className="link-arrow faq__more" {...kranthoField(item, 'docs-page')}>
                    Read the documentation
                  </Link>
                )}
              </div>
            </details>
          )
        })}
      </div>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: structured data built from published faq documents, escaped */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(structured) }} />
    </div>
  )
}
