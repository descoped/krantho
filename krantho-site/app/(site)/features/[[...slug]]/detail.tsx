import { LEAD_SECTION } from '@krantho/core'
import { type KranthoMarks, kranthoField, kranthoSection } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { maybe, page, type Summary, summaries, text } from '../../../../lib/content'
import { sampleHtml, slugify } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { HowMade } from '../../../components/how-made'
import { Icon, isIconName } from '../../../components/icons'
import { Html, Markdown } from '../../../components/markdown'
import { DocsLink, type NextStep, NextSteps } from '../../../components/next-steps'
import { type ContractSection, heroMarks, PageHero, readContract } from '../../../components/page-hero'
import '../../../styles/product.css'
import { collections } from '../../../../krantho.collections'

// A feature page. The body follows the section contract Problem → Approach →
// Proof → Limits: the problem as a calm statement, the approach as prose, the
// proof as a highlighted panel with real code (the `proof-sample` field plus any
// samples the section embeds), the limits in a quiet box. Sections outside the
// contract render as prose, in the order the editor wrote them.

// The sections this template designs, as the collection declares them
const CONTRACT = collections.features.sections

function Rail({ section, index }: { section: ContractSection; index: number }): React.ReactElement {
  return (
    <div className="contract__rail">
      <span className="contract__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h2 id={slugify(section.heading)} className="contract__title">
        {section.heading}
      </h2>
    </div>
  )
}

function ProofPanel({
  section,
  index,
  code,
  marks,
  codeMarks,
}: {
  section: ContractSection
  index: number
  code: string
  /** The section's Live marks; none when the panel only shows the proof sample */
  marks?: KranthoMarks | undefined
  codeMarks: KranthoMarks
}): React.ReactElement {
  const both = Boolean(section.markdown && code)
  return (
    <section className="contract contract--proof" aria-labelledby={slugify(section.heading)} {...marks}>
      <div className="proof-panel">
        <Rail section={section} index={index} />
        <div className={`proof-panel__body${both ? ' proof-panel__body--split' : ''}`}>
          {section.markdown && <Markdown source={section.markdown} className="prose proof-panel__prose" />}
          {code && <Html html={code} className="proof-panel__code" marks={codeMarks} />}
        </div>
      </div>
    </section>
  )
}

function ContractBlock({ section, index, marks }: { section: ContractSection; index: number; marks: KranthoMarks }): React.ReactElement {
  const className = section.role === 'problem' ? 'prose statement' : 'prose'
  const content = <Markdown source={section.markdown} className={className} />
  return (
    <section className={`contract contract--${section.role ?? 'prose'}`} aria-labelledby={slugify(section.heading)} {...marks}>
      <Rail section={section} index={index} />
      <div className="contract__content">
        {section.role === 'limits' ? <div className="limits-box">{content}</div> : content}
      </div>
    </section>
  )
}

/** The features after this one, in order and wrapping around — read as a sequence */
function following(features: Summary[], slug: string, count: number): Summary[] {
  const others = features.filter((feature) => feature.slug !== slug)
  const at = features.findIndex((feature) => feature.slug === slug)
  const after = others.slice(Math.max(at, 0)).concat(others.slice(0, Math.max(at, 0)))
  return after.slice(0, count)
}

export async function FeatureDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const feature = await page('features', slug)
  const docsSlug = text(feature, 'docs-page')
  const proofName = text(feature, 'proof-sample')
  const [index, features, docsPage, proofCode] = await Promise.all([
    maybe('pages', 'features'),
    summaries('features'),
    docsSlug ? maybe('docs', docsSlug) : undefined,
    proofName ? sampleHtml(proofName) : '',
  ])
  const icon = text(feature, 'icon')
  const { intro, sections } = readContract(feature.rawContent, CONTRACT)
  const hasProof = sections.some((section) => section.role === 'proof')
  // A proof sample with no Proof section still earns its panel, after the others
  const blocks: ContractSection[] =
    !hasProof && proofCode ? [...sections, { heading: 'Proof', markdown: '', role: 'proof' }] : sections

  const steps: NextStep[] = following(features, slug, 3).map((other) => {
    const otherIcon = text(other, 'icon')
    return {
      href: routeOf('features', other.slug),
      title: text(other, 'title'),
      description: text(other, 'benefit'),
      icon: isIconName(otherIcon) ? otherIcon : undefined,
      marks: {
        title: kranthoField(other, 'title'),
        description: kranthoField(other, 'benefit'),
        icon: kranthoField(other, 'icon'),
      },
    }
  })

  return (
    <>
      <SeoJsonLd
        collection="features"
        slug={slug}
        structure={{
          trail: [{ name: text(index, 'title') || 'Features', url: '/features' }, { name: text(feature, 'title') }],
        }}
      />
      <PageHero
        eyebrow={
          <Link href="/features" className="page-hero__back" {...kranthoField(index, 'title')}>
            {text(index, 'title') || 'Features'}
          </Link>
        }
        title={text(feature, 'title')}
        lede={text(feature, 'benefit')}
        icon={isIconName(icon) ? icon : undefined}
        marks={heroMarks(feature, { title: 'title', lede: 'benefit', icon: 'icon' })}
      />

      <div className="container contract-body">
        {intro && <Markdown source={intro} className="prose contract-intro" marks={kranthoSection(feature, LEAD_SECTION)} />}
        {blocks.map((section, at) =>
          section.role === 'proof' ? (
            <ProofPanel
              key={section.heading}
              section={section}
              index={at}
              code={proofCode}
              marks={sections.includes(section) ? kranthoSection(feature, section.heading) : undefined}
              codeMarks={kranthoField(feature, 'proof-sample')}
            />
          ) : (
            <ContractBlock key={section.heading} section={section} index={at} marks={kranthoSection(feature, section.heading)} />
          ),
        )}
      </div>

      {docsSlug && <DocsLink slug={docsSlug} doc={docsPage} from={feature} />}
      <NextSteps steps={steps} />

      <HowMade
        template="app/(site)/features/[[...slug]]/detail.tsx"
        sources={[
          { collection: 'features', slug, doc: feature },
          ...(docsSlug && docsPage ? [{ collection: 'docs', slug: docsSlug, doc: docsPage }] : []),
        ]}
      />
    </>
  )
}
