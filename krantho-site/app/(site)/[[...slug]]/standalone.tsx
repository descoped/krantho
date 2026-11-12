import { markBodySections } from '@krantho/core/marks'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { page, text } from '../../../lib/content'
import { HowMade } from '../../components/how-made'
import { Html, render } from '../../components/markdown'
import { heroMarks, PageHero, withoutTitle } from '../../components/page-hero'
import '../../styles/page.css'

// The standalone pages template: one document from the pages collection (about,
// agent skills, legal) at /<slug>. The hero carries the eyebrow, the title as
// the page's one <h1> and the description as its lede; the body is prose with an
// on-page table of contents once it is long enough to need one.

/** Enough `##` sections to be worth a table of contents */
const TOC_MIN = 3

export async function Standalone({ slug }: { slug: string }): Promise<React.ReactElement> {
  const doc = await page('pages', slug)
  const body = withoutTitle(doc.rawContent)
  const { html, toc } = await render(body)
  const sections = toc.filter((entry) => entry.depth === 2)
  const withToc = sections.length >= TOC_MIN

  return (
    <>
      <SeoJsonLd collection="pages" slug={slug} />
      <PageHero
        eyebrow={text(doc, 'eyebrow') || undefined}
        title={text(doc, 'title')}
        lede={text(doc, 'description')}
        marks={heroMarks(doc, { eyebrow: 'eyebrow', title: 'title', lede: 'description' })}
      />
      <div className={`container standalone${withToc ? ' standalone--toc' : ''}`}>
        {withToc && (
          <nav className="standalone__toc" aria-label="On this page">
            <p className="standalone__toc-title">On this page</p>
            <ul>
              {sections.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`}>{entry.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <Html html={markBodySections(html, body, doc)} className="prose standalone__body" />
      </div>
      <HowMade template="app/(site)/[[...slug]]/standalone.tsx" sources={[{ collection: 'pages', slug, doc }]} />
    </>
  )
}
