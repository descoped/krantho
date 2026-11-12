import { kranthoField, markBodySections } from '@krantho/core/marks'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { all, page, text, type Summary } from '../../../../lib/content'
import type { TocEntry } from '../../../../lib/markdown'
import { areaOf, docsIndex, groupByArea, readingOrder, refs } from '../../../components/docs-areas'
import { DocsSidebar } from '../../../components/docs-sidebar'
import { DocsToc } from '../../../components/docs-toc'
import { SectionHash } from '../../../components/section-hash'
import { Faq } from '../../../components/faq'
import { HowMade } from '../../../components/how-made'
import { Html, render } from '../../../components/markdown'
import { Glossary } from './docs-glossary'
import { Breadcrumb, docsStructure, MetaRow, NextSteps, Pager, Prerequisites, Related } from './docs-parts'

// A docs page: sidebar, the article (breadcrumb, title, summary, meta, "you'll
// need", body, FAQ, next steps, related, previous/next) and the on-page table of
// contents. The `glossary` page adds every published glossary entry.

const TEMPLATE = 'app/(site)/docs/[[...slug]]/page.tsx'
const GLOSSARY_SLUG = 'glossary'
const FAQ_HEADING = 'Questions and answers'

/** Previous and next page around a slug in the reading order */
function neighbours(docs: Summary[], slug: string): { previous?: Summary | undefined; next?: Summary | undefined } {
  const order = readingOrder(docs)
  const index = order.findIndex((doc) => doc.slug === slug)
  if (index < 0) return {}
  return { previous: order[index - 1], next: order[index + 1] }
}

/** The table of contents: the body's headings, then the blocks the template adds */
function tocOf(body: TocEntry[], extras: { id: string; text: string; when: boolean }[]): TocEntry[] {
  return [...body, ...extras.filter((extra) => extra.when).map(({ id, text: label }) => ({ id, text: label, depth: 2 as const }))]
}

export async function DocsArticle({ slug }: { slug: string }): Promise<React.ReactElement> {
  const [doc, { docs, bySlug }, faqs] = await Promise.all([page('docs', slug), docsIndex(), all('faq')])
  const [rendered, glossary] = await Promise.all([
    render(doc.rawContent),
    slug === GLOSSARY_SLUG ? all('glossary') : Promise.resolve([]),
  ])
  const title = text(doc, 'title')
  const description = text(doc, 'description')
  const questions = faqs.filter((faq) => text(faq, 'docs-page') === slug)
  const next = refs(doc, 'next', bySlug)
  const related = refs(doc, 'related', bySlug)
  const { previous, next: following } = neighbours(docs, slug)
  const structure = docsStructure(doc, docs, areaOf(doc))
  const toc = tocOf(rendered.toc, [
    { id: 'faq', text: FAQ_HEADING, when: questions.length > 0 },
    { id: 'docs-next-steps', text: 'Next steps', when: next.length > 0 },
  ])

  return (
    <>
      <SeoJsonLd collection="docs" slug={slug} structure={structure} />
      <div className="container container--wide docs-layout">
        <DocsSidebar groups={groupByArea(docs)} current={slug} currentTitle={title} currentMarks={kranthoField(doc, 'title')} />
        <article className="docs-article">
          <SectionHash selector=".docs-article :is(h2, h3)[id]" />
          <header className="docs-article__header">
            <Breadcrumb trail={structure.trail ?? []} doc={doc} />
            <h1 className="docs-article__title" {...kranthoField(doc, 'title')}>
              {title}
            </h1>
            {description && (
              <p className="lede docs-article__lede" {...kranthoField(doc, 'description')}>
                {description}
              </p>
            )}
            <MetaRow doc={doc} />
          </header>
          <Prerequisites docs={refs(doc, 'prerequisites', bySlug)} from={doc} />
          <Html html={markBodySections(rendered.html, doc.rawContent, doc)} className="prose docs-prose" />
          <Glossary entries={glossary} bySlug={bySlug} />
          {questions.length > 0 && (
            <div className="docs-faq">
              <Faq items={questions} id="faq" heading={FAQ_HEADING} />
            </div>
          )}
          <NextSteps docs={next} from={doc} />
          <Related docs={related} from={doc} />
          <Pager previous={previous} next={following} />
        </article>
        <div className="docs-aside">
          <DocsToc entries={toc} />
        </div>
      </div>
      <HowMade template={TEMPLATE} sources={[{ collection: 'docs', slug, doc }]} />
    </>
  )
}
