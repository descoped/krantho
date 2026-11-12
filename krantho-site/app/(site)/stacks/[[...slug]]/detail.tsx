import { LEAD_SECTION } from '@krantho/core'
import { kranthoField, kranthoSection } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { type Doc, list, maybe, page, text, summaries } from '../../../../lib/content'
import { slugify, stackLabel } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { HowMade } from '../../../components/how-made'
import { Markdown } from '../../../components/markdown'
import { DocsLink, NextSteps } from '../../../components/next-steps'
import { heroMarks, PageHero, readContract } from '../../../components/page-hero'
import '../../../styles/product.css'
import { collections } from '../../../../krantho.collections'

// A stack page: from an empty project to a deployed site on one framework. The
// section contract Install → Wire → Render → Deploy renders as a numbered flow —
// nodes on one edge, the content-graph motif — each step's markdown embedding
// the shared code samples. Inside the page, samples show this stack's variant
// whatever the visitor's stack preference is (data-stack-scope, product.css).

// The sections this template designs, as the collection declares them
const CONTRACT = collections.stacks.sections
const SCOPED = new Set(['next', 'sveltekit', 'express'])

function Packages({ stack }: { stack: Doc }): React.ReactElement | null {
  const packages = list(stack, 'packages')
  const ui = list(stack, 'ui-packages')
  if (packages.length === 0 && ui.length === 0) return null
  return (
    <aside className="facts" aria-label="Packages">
      {packages.length > 0 && (
        <div className="facts__group" {...kranthoField(stack, 'packages')}>
          <h2 className="facts__label">Packages</h2>
          <ul className="package-list package-list--column">
            {packages.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ui.length > 0 && (
        <div className="facts__group" {...kranthoField(stack, 'ui-packages')}>
          <h2 className="facts__label">UI packages</h2>
          <ul className="package-list package-list--column">
            {ui.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

export async function StackDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const stack = await page('stacks', slug)
  const docsSlug = text(stack, 'docs-page')
  const [index, stacks, docsPage] = await Promise.all([
    maybe('pages', 'stacks'),
    summaries('stacks'),
    docsSlug ? maybe('docs', docsSlug) : undefined,
  ])
  const framework = text(stack, 'framework')
  const { intro, sections } = readContract(stack.rawContent, CONTRACT)
  const flow = sections.filter((section) => section.role)
  const rest = sections.filter((section) => !section.role)

  return (
    <>
      <SeoJsonLd
        collection="stacks"
        slug={slug}
        structure={{ trail: [{ name: text(index, 'title') || 'Stacks', url: '/stacks' }, { name: text(stack, 'title') }] }}
      />
      <PageHero
        eyebrow={
          <>
            <Link href="/stacks" className="page-hero__back" {...kranthoField(index, 'title')}>
              {text(index, 'title') || 'Stacks'}
            </Link>
            <span aria-hidden="true">/</span>
            <span {...kranthoField(stack, 'framework')}>{stackLabel(framework)}</span>
          </>
        }
        title={text(stack, 'title')}
        lede={text(stack, 'tagline')}
        icon="frameworks"
        marks={heroMarks(stack, { title: 'title', lede: 'tagline' })}
      />

      <div className="container with-aside" data-stack-scope={SCOPED.has(framework) ? framework : undefined}>
        <div className="with-aside__main">
          {intro && <Markdown source={intro} className="prose contract-intro" marks={kranthoSection(stack, LEAD_SECTION)} />}
          {flow.length > 0 && (
            <ol className="flow">
              {flow.map((section, at) => (
                <li key={section.heading} className="flow__step" {...kranthoSection(stack, section.heading)}>
                  <span className="flow__node" aria-hidden="true">
                    {at + 1}
                  </span>
                  <h2 id={slugify(section.heading)} className="flow__title">
                    {section.heading}
                  </h2>
                  <Markdown source={section.markdown} className="prose flow__body" />
                </li>
              ))}
            </ol>
          )}
          {rest.map((section) => (
            <section key={section.heading} className="free-section" aria-labelledby={slugify(section.heading)} {...kranthoSection(stack, section.heading)}>
              <h2 id={slugify(section.heading)} className="free-section__title">
                {section.heading}
              </h2>
              <Markdown source={section.markdown} />
            </section>
          ))}
        </div>
        <div className="with-aside__aside">
          <Packages stack={stack} />
        </div>
      </div>

      {docsSlug && <DocsLink slug={docsSlug} doc={docsPage} from={stack} />}
      <NextSteps
        steps={stacks
          .filter((other) => other.slug !== slug)
          .map((other) => ({
            href: routeOf('stacks', other.slug),
            title: text(other, 'title'),
            description: text(other, 'tagline'),
            label: stackLabel(text(other, 'framework')),
            icon: 'frameworks' as const,
            marks: {
              title: kranthoField(other, 'title'),
              description: kranthoField(other, 'tagline'),
              label: kranthoField(other, 'framework'),
            },
          }))}
      />

      <HowMade
        template="app/(site)/stacks/[[...slug]]/detail.tsx"
        sources={[
          { collection: 'stacks', slug, doc: stack },
          ...(docsSlug && docsPage ? [{ collection: 'docs', slug: docsSlug, doc: docsPage }] : []),
        ]}
      />
    </>
  )
}
