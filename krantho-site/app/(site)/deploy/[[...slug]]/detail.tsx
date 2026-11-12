import { LEAD_SECTION } from '@krantho/core'
import { kranthoField, kranthoSection } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { type Doc, maybe, page, text, summaries } from '../../../../lib/content'
import { slugify } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { HowMade } from '../../../components/how-made'
import { Icon } from '../../../components/icons'
import { Markdown } from '../../../components/markdown'
import { DocsLink, NextSteps } from '../../../components/next-steps'
import { type ContractSection, heroMarks, PageHero, readContract } from '../../../components/page-hero'
import { HostFacts, kindLabel, strategyOf } from './facts'
import '../../../styles/product.css'
import { collections } from '../../../../krantho.collections'

// A host page: how to run a krantho site there. The section contract Set up →
// Configure → Cache → Verify renders as a numbered flow beside a facts panel;
// the Cache step carries the host's page-cache strategy, and Verify closes the
// flow with a check instead of a number.

// The sections this template designs, as the collection declares them
const CONTRACT = collections.hosts.sections

function Step({
  section,
  number,
  strategy,
  host,
}: {
  section: ContractSection
  number: number
  strategy: { value: string; explanation: string }
  /** The host document the step's section and strategy belong to (Live marks) */
  host: Doc
}): React.ReactElement {
  const verify = section.role === 'verify'
  return (
    <li className={`flow__step flow__step--${slugify(section.role ?? 'step')}`} {...kranthoSection(host, section.heading)}>
      <span className="flow__node" aria-hidden="true">
        {verify ? <Icon name="check" size={16} /> : number}
      </span>
      <h2 id={slugify(section.heading)} className="flow__title">
        {section.heading}
      </h2>
      {section.role === 'cache' && strategy.value && (
        <p className="flow__note">
          <code className="strategy" {...kranthoField(host, 'cache-strategy')}>
            {strategy.value}
          </code>
          <span>{strategy.explanation}</span>
        </p>
      )}
      <Markdown source={section.markdown} className="prose flow__body" />
    </li>
  )
}

export async function HostDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const host = await page('hosts', slug)
  const docsSlug = text(host, 'docs-page')
  const [index, hosts, docsPage] = await Promise.all([
    maybe('pages', 'deploy'),
    summaries('hosts'),
    docsSlug ? maybe('docs', docsSlug) : undefined,
  ])
  const { intro, sections } = readContract(host.rawContent, CONTRACT)
  const flow = sections.filter((section) => section.role)
  const rest = sections.filter((section) => !section.role)
  const strategy = strategyOf(host)

  return (
    <>
      <SeoJsonLd collection="hosts" slug={slug} />
      <PageHero
        eyebrow={
          <>
            <Link href="/deploy" className="page-hero__back" {...kranthoField(index, 'title')}>
              {text(index, 'title') || 'Deploy'}
            </Link>
            <span aria-hidden="true">/</span>
            <span {...kranthoField(host, 'kind')}>{kindLabel(text(host, 'kind'))}</span>
          </>
        }
        title={text(host, 'title')}
        lede={text(host, 'description')}
        icon="deploy"
        marks={heroMarks(host, { title: 'title', lede: 'description' })}
      />

      <div className="container with-aside">
        <div className="with-aside__main">
          {intro && <Markdown source={intro} className="prose contract-intro" marks={kranthoSection(host, LEAD_SECTION)} />}
          {flow.length > 0 && (
            <ol className="flow">
              {flow.map((section, at) => (
                <Step key={section.heading} section={section} number={at + 1} strategy={strategy} host={host} />
              ))}
            </ol>
          )}
          {rest.map((section) => (
            <section key={section.heading} className="free-section" aria-labelledby={slugify(section.heading)} {...kranthoSection(host, section.heading)}>
              <h2 id={slugify(section.heading)} className="free-section__title">
                {section.heading}
              </h2>
              <Markdown source={section.markdown} />
            </section>
          ))}
        </div>
        <div className="with-aside__aside">
          <HostFacts host={host} />
        </div>
      </div>

      {docsSlug && <DocsLink slug={docsSlug} doc={docsPage} from={host} />}
      <NextSteps
        steps={hosts
          .filter((other) => other.slug !== slug)
          .map((other) => ({
            href: routeOf('hosts', other.slug),
            title: text(other, 'title'),
            description: text(other, 'description'),
            label: `${kindLabel(text(other, 'kind'))} · ${strategyOf(other).value}`,
            marks: { title: kranthoField(other, 'title'), description: kranthoField(other, 'description') },
          }))}
      />

      <HowMade
        template="app/(site)/deploy/[[...slug]]/detail.tsx"
        sources={[
          { collection: 'hosts', slug, doc: host },
          ...(docsSlug && docsPage ? [{ collection: 'docs', slug: docsSlug, doc: docsPage }] : []),
        ]}
      />
    </>
  )
}
