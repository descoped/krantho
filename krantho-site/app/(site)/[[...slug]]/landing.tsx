import { SeoJsonLd } from '@krantho/ui-react/server'
import Image from 'next/image'
import Link from 'next/link'
import { all, type Doc, list, page, type Summary, summaries, text } from '../../../lib/content'
import { type BodySection as Section, findSection, LEAD_SECTION, splitSections } from '@krantho/core'
import { type KranthoMarks, kranthoField, kranthoSection } from '@krantho/core/marks'
import { sampleHtml, slugify, stackLabel } from '../../../lib/markdown'
import { routeOf } from '../../../lib/routes'
import { splitCode } from '../../../lib/split-code'
import { ContentGraph } from '../../components/content-graph'
import { SectionHash } from '../../components/section-hash'
import { Faq } from '../../components/faq'
import { HowMade } from '../../components/how-made'
import { Icon, isIconName } from '../../components/icons'
import { Html, render } from '../../components/markdown'
import '../../styles/landing.css'
import { collections } from '../../../krantho.collections'

// The landing page template. It renders landing/home — fields for the hero, `##`
// sections for the rest — with the features, stacks, hosts and product FAQ
// collections. Section contract: Install, Problem, How it works, For editors, Fit
// and Get started get designed treatments; Capabilities, Your stack, your host
// and Questions, when present, give their bands a lead; any other section renders
// as prose before the questions. Every word on the page comes from /studio. Each
// section has an id, so `/#<section>` opens the page at it, and the address bar
// follows the section in view (SectionHash).

// The sections this template designs, as the collection declares them
const KNOWN = collections.landing.sections.map((section) => section.toLowerCase())

const HOST_KINDS: Record<string, string> = { platform: 'Platform', cdn: 'CDN', server: 'Server' }

interface Sub {
  title: string
  markdown: string
}

/** A section's `###` subsections, and the prose before the first one (fences ignored) */
function subsections(markdown: string): { intro: string; items: Sub[] } {
  const intro: string[] = []
  const items: { title: string; lines: string[] }[] = []
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^(```|~~~)/.test(line.trim())) fenced = !fenced
    const heading = fenced ? null : line.match(/^###\s+(.+?)\s*#*\s*$/)
    if (heading?.[1]) items.push({ title: heading[1], lines: [] })
    else (items.at(-1)?.lines ?? intro).push(line)
  }
  return {
    intro: intro.join('\n').trim(),
    items: items.map((item) => ({ title: item.title, markdown: item.lines.join('\n').trim() })),
  }
}

/**
 * A step's prose and its code, when the code is one contiguous run (a sample
 * embed or adjacent fences) — so the two can sit side by side on wide screens.
 */
/** A heading's text with `code` spans — titles come from `###` lines */
function Inline({ value }: { value: string }): React.ReactElement {
  const parts = value.split(/(`[^`]+`)/)
  return (
    <>
      {parts.map((part, index) =>
        /^`[^`]+`$/.test(part) ? <code key={`${index}-${part}`}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  )
}

/** Internal hrefs use client navigation; anything absolute is a plain link */
function Action({ href, className, children, track, marks }: { href: string; className: string; children: React.ReactNode; track?: string; marks?: KranthoMarks | undefined }): React.ReactElement {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} data-track={track} rel="noopener" {...marks}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} data-track={track} {...marks}>
      {children}
    </Link>
  )
}

/* The hero backdrop: an aurora glow and topographic contour lines. The lines are
   a static SVG (public/brand/contours.svg) drawn through a CSS mask, so they are
   cached once and never add to the page's HTML. */
function Backdrop(): React.ReactElement {
  return (
    <div className="landing-backdrop" aria-hidden="true">
      <span className="landing-backdrop__aurora" />
      <span className="landing-backdrop__contours" />
    </div>
  )
}

/** A section's heading, linking to the section: `/#<id>` opens the page at it */
function Label({ id, title }: { id: string; title: string }): React.ReactElement {
  return (
    <h2 id={`${id}-title`} className="landing-label">
      <a href={`#${id}`} className="landing-label__link">
        {title}
      </a>
    </h2>
  )
}

/** A band's heading: the section title as its label, the section's prose as the lead */
async function Head({ id, title, markdown }: { id: string; title: string; markdown?: string | undefined }): Promise<React.ReactElement> {
  const lead = markdown ? (await render(markdown)).html : ''
  return (
    <header className="landing-head">
      <Label id={id} title={title} />
      {lead && <Html html={lead} className="landing-lead" />}
    </header>
  )
}

async function Hero({ home }: { home: Doc }): Promise<React.ReactElement> {
  const sample = text(home, 'hero-sample')
  const code = sample ? await sampleHtml(sample) : ''
  const secondary = text(home, 'secondary-label')
  const secondaryHref = text(home, 'secondary-href')
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <Backdrop />
      <div className="container landing-hero__grid">
        <div className="landing-hero__copy">
          {text(home, 'eyebrow') && (
            <p className="eyebrow landing-hero__eyebrow" {...kranthoField(home, 'eyebrow')}>
              <span className="landing-hero__dot" aria-hidden="true" />
              {text(home, 'eyebrow')}
            </p>
          )}
          <h1 id="landing-title" className="landing-hero__title" {...kranthoField(home, 'headline')}>
            {text(home, 'headline')}
          </h1>
          <p className="landing-hero__subline" {...kranthoField(home, 'subline')}>
            {text(home, 'subline')}
          </p>
          <div className="landing-actions">
            <Action href={text(home, 'primary-href')} className="button button--primary landing-actions__primary" track="Get started" marks={kranthoField(home, 'primary-label')}>
              {text(home, 'primary-label')}
              <Icon name="arrow" size={16} />
            </Action>
            {secondary && secondaryHref && (
              <Action href={secondaryHref} className="button button--secondary" marks={kranthoField(home, 'secondary-label')}>
                {secondary}
              </Action>
            )}
          </div>
        </div>
        <div className="landing-hero__visual">
          <ContentGraph id="hero-graph" />
        </div>
      </div>
      {code && (
        <div className="container">
          <div className="landing-editor" {...kranthoField(home, 'hero-sample')}>
            <span className="landing-editor__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <Html html={code} className="landing-editor__code" />
          </div>
        </div>
      )}
    </section>
  )
}

/** The install commands: each `###` subsection is a card with its prose and its code; the prose before them is a note below */
async function Install({ section, marks }: { section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { intro, items } = subsections(section.markdown)
  const note = intro ? (await render(intro)).html : ''
  const cards = await Promise.all(
    items.map(async (item) => {
      const split = splitCode(item.markdown)
      const [prose, code] = await Promise.all([render(split ? split.prose : item.markdown), split ? render(split.code) : undefined])
      return { title: item.title, prose: prose.html, code: code?.html ?? '' }
    }),
  )
  return (
    <section className="section section--subtle landing-install" id="install" aria-labelledby="install-title" {...marks}>
      <div className="container">
        <header className="landing-head">
          <Label id="install" title={section.heading} />
        </header>
        <ol className="landing-install__grid">
          {cards.map((card) => (
            <li key={card.title} className="landing-install__card">
              <h3 className="landing-install__title">
                <Inline value={card.title} />
              </h3>
              {card.prose && <Html html={card.prose} className="prose landing-install__prose" />}
              {card.code && <Html html={card.code} className="landing-install__code" />}
            </li>
          ))}
        </ol>
        {note && <Html html={note} className="landing-install__note" />}
      </div>
    </section>
  )
}

async function Problem({ section, marks }: { section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { html } = await render(section.markdown)
  return (
    <section className="section landing-problem" id="problem" aria-labelledby="problem-title" {...marks}>
      <div className="container">
        <Label id="problem" title={section.heading} />
        <Html html={html} className="landing-statement" />
      </div>
    </section>
  )
}

async function Step({ item, index, last }: { item: Sub; index: number; last: boolean }): Promise<React.ReactElement> {
  const split = splitCode(item.markdown)
  const [prose, code] = await Promise.all([render(split ? split.prose : item.markdown), split ? render(split.code) : undefined])
  return (
    <li className={`landing-step${code ? ' landing-step--split' : ''}`}>
      <div className="landing-step__rail" aria-hidden="true">
        <span className="landing-step__num">{String(index + 1).padStart(2, '0')}</span>
        {!last && <span className="landing-step__line" />}
      </div>
      <div className="landing-step__main">
        <div className="landing-step__text">
          <h3 className="landing-step__title">
            <Inline value={item.title} />
          </h3>
          <Html html={prose.html} className="prose landing-step__prose" />
        </div>
        {code && <Html html={code.html} className="landing-step__code" />}
      </div>
    </li>
  )
}

function HowItWorks({ section, marks }: { section: Section; marks: KranthoMarks }): React.ReactElement {
  const { intro, items } = subsections(section.markdown)
  return (
    <section className="section section--subtle landing-how" id="how-it-works" aria-labelledby="how-it-works-title" {...marks}>
      <div className="container">
        <Head id="how-it-works" title={section.heading} markdown={items.length ? intro : section.markdown} />
        {items.length > 0 && (
          <ol className="landing-steps">
            {items.map((item, index) => (
              <Step key={item.title} item={item} index={index} last={index === items.length - 1} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function Capabilities({ features, section, marks }: { features: Summary[]; section?: Section | undefined; marks?: KranthoMarks | undefined }): React.ReactElement | null {
  if (features.length === 0) return null
  return (
    <section className="section landing-capabilities" id="capabilities" aria-labelledby="capabilities-title" {...marks}>
      <div className="container">
        <Head id="capabilities" title={section?.heading ?? 'Capabilities'} markdown={section?.markdown} />
        <ul className="landing-features">
          {features.map((feature) => {
            const icon = text(feature, 'icon')
            const benefit = text(feature, 'benefit') ? 'benefit' : 'description'
            return (
              <li key={feature.slug}>
                <Link href={routeOf('features', feature.slug)} className="card landing-feature">
                  <span className="landing-feature__icon" {...kranthoField(feature, 'icon')}>
                    <Icon name={isIconName(icon) ? icon : 'content'} size={22} />
                  </span>
                  <h3 className="landing-feature__title" {...kranthoField(feature, 'title')}>
                    {text(feature, 'title')}
                  </h3>
                  <p className="landing-feature__benefit" {...kranthoField(feature, benefit)}>
                    {text(feature, benefit)}
                  </p>
                  <span className="landing-feature__more" aria-hidden="true">
                    <Icon name="arrow" size={16} />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function StackCards({ stacks }: { stacks: Summary[] }): React.ReactElement {
  return (
    <ul className="landing-stacks">
      {stacks.map((stack) => (
        <li key={stack.slug}>
          <Link href={routeOf('stacks', stack.slug)} className="card landing-stackcard">
            <span className="landing-stackcard__head">
              <Icon name="frameworks" size={18} />
              <h4 className="landing-stackcard__title" {...kranthoField(stack, 'title')}>
                {text(stack, 'title')}
              </h4>
            </span>
            <p className="landing-stackcard__tagline" {...kranthoField(stack, 'tagline')}>
              {text(stack, 'tagline')}
            </p>
            <span className="landing-stackcard__packages" {...kranthoField(stack, 'packages')}>
              {list(stack, 'packages').map((name) => (
                <code key={name} className="badge">
                  {name}
                </code>
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function HostTable({ hosts }: { hosts: Summary[] }): React.ReactElement {
  return (
    <div className="landing-hosts">
      <table>
        <caption className="visually-hidden">Hosts, the frameworks each runs and the page caching it uses</caption>
        <thead>
          <tr>
            <th scope="col">Host</th>
            <th scope="col">Kind</th>
            <th scope="col" className="landing-hosts__frameworks">
              Frameworks
            </th>
            <th scope="col">
              <code>cache.pages</code>
            </th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((host) => (
            <tr key={host.slug}>
              <th scope="row">
                <Link href={routeOf('hosts', host.slug)} {...kranthoField(host, 'title')}>
                  {text(host, 'title')}
                </Link>
              </th>
              <td {...kranthoField(host, 'kind')}>{HOST_KINDS[text(host, 'kind')] ?? text(host, 'kind')}</td>
              <td className="landing-hosts__frameworks" {...kranthoField(host, 'frameworks')}>
                {list(host, 'frameworks').map(stackLabel).join(', ')}
              </td>
              <td>
                <code {...kranthoField(host, 'cache-strategy')}>{text(host, 'cache-strategy')}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StackAndHost({ stacks, hosts, section, marks }: { stacks: Summary[]; hosts: Summary[]; section?: Section | undefined; marks?: KranthoMarks | undefined }): React.ReactElement | null {
  if (stacks.length === 0 && hosts.length === 0) return null
  return (
    <section className="section section--subtle landing-stack" id="stack-and-host" aria-labelledby="stack-and-host-title" {...marks}>
      <div className="container">
        <Head id="stack-and-host" title={section?.heading ?? 'Your stack, your host'} markdown={section?.markdown} />
        <div className="landing-stack__grid">
          {stacks.length > 0 && (
            <div className="landing-stack__col">
              <h3 className="landing-sublabel">Frameworks</h3>
              <StackCards stacks={stacks} />
              <Link href="/stacks" className="link-arrow">
                All frameworks
              </Link>
            </div>
          )}
          {hosts.length > 0 && (
            <div className="landing-stack__col">
              <h3 className="landing-sublabel">Hosts</h3>
              <HostTable hosts={hosts} />
              <Link href="/deploy" className="link-arrow">
                All hosts
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

async function ForEditors({ section, marks }: { section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { html } = await render(section.markdown)
  const alt = 'krantho Studio with a document open in the editor'
  const sizes = '(min-width: 1024px) 40rem, 100vw'
  return (
    <section className="section landing-editors" id="for-editors" aria-labelledby="for-editors-title" {...marks}>
      <div className="container landing-editors__grid">
        <div className="landing-editors__copy">
          <Label id="for-editors" title={section.heading} />
          <Html html={html} className="landing-copy" />
        </div>
        <figure className="shot">
          <div className="shot__bar" aria-hidden="true">
            <span className="shot__dots">
              <span />
              <span />
              <span />
            </span>
            <span className="shot__url">krantho.com/studio</span>
          </div>
          <Image className="shot__img shot__img--light" src="/screens/studio-editor-light.png" width={1600} height={1000} sizes={sizes} loading="lazy" alt={alt} />
          <Image className="shot__img shot__img--dark" src="/screens/studio-editor-dark.png" width={1600} height={1000} sizes={sizes} loading="lazy" alt={alt} />
        </figure>
      </div>
    </section>
  )
}

/** "It is not the right fit when", "Krantho doesn't fit when" — the column of limits */
const LIMITS = /\b(not|isn['’]t|doesn['’]t|don['’]t|won['’]t|without)\b/i

async function Fit({ section, marks }: { section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { intro, items } = subsections(section.markdown)
  const bodies = await Promise.all(items.map((item) => render(item.markdown)))
  return (
    <section className="section section--subtle landing-fit" id="fit" aria-labelledby="fit-title" {...marks}>
      <div className="container">
        <Head id="fit" title={section.heading} markdown={items.length ? intro : section.markdown} />
        <div className="landing-fit__grid">
          {items.map((item, index) => {
            const limit = LIMITS.test(item.title) || (index > 0 && !items.some((other) => LIMITS.test(other.title)))
            return (
              <div key={item.title} className={`landing-fit__col landing-fit__col--${limit ? 'no' : 'yes'}`}>
                <h3 className="landing-fit__title">
                  <span className="landing-fit__icon" aria-hidden="true">
                    <Icon name={limit ? 'cross' : 'check'} size={16} />
                  </span>
                  <Inline value={item.title} />
                </h3>
                <Html html={bodies[index]?.html ?? ''} className="prose landing-fit__list" />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

async function Prose({ section, marks }: { section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { html } = await render(section.markdown)
  const id = slugify(section.heading) || 'section'
  return (
    <section className="section landing-prose" id={id} aria-labelledby={`${id}-title`} {...marks}>
      <div className="container">
        <Label id={id} title={section.heading} />
        <Html html={html} className="prose" />
      </div>
    </section>
  )
}

function Questions({ items, section, marks }: { items: Doc[]; section?: Section | undefined; marks?: KranthoMarks | undefined }): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <section className="section landing-questions" id="questions" aria-labelledby="questions-title" {...marks}>
      <div className="container landing-questions__grid">
        <Head id="questions" title={section?.heading ?? 'Questions'} markdown={section?.markdown} />
        <Faq items={items} />
      </div>
    </section>
  )
}

async function GetStarted({ home, section, marks }: { home: Doc; section: Section; marks: KranthoMarks }): Promise<React.ReactElement> {
  const { html } = await render(section.markdown)
  return (
    <section className="section landing-start" id="get-started" aria-labelledby="get-started-title" {...marks}>
      <div className="container">
        <div className="landing-start__panel">
          <Backdrop />
          <div className="landing-start__inner">
            <Label id="get-started" title={section.heading} />
            <Html html={html} className="landing-copy landing-start__copy" />
            <div className="landing-actions">
              <Action href={text(home, 'primary-href')} className="button button--primary landing-actions__primary" track="Get started" marks={kranthoField(home, 'primary-label')}>
                {text(home, 'primary-label')}
                <Icon name="arrow" size={16} />
              </Action>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** A collection this page lists, for "How this page is made" */
function listed(collection: string, docs: Summary[]): { collection: string; slug: string } {
  return { collection, slug: docs.map((doc) => doc.slug).join(', ') || '—' }
}

export async function Landing(): Promise<React.ReactElement> {
  const [home, features, stacks, hosts, faqs] = await Promise.all([
    page('landing', 'home'),
    summaries('features'),
    summaries('stacks'),
    summaries('hosts'),
    all('faq'),
  ])
  const questions = faqs.filter((doc) => text(doc, 'topic') === 'product')
  const { lead: intro, sections } = splitSections(home.rawContent)
  const find = (title: string): Section | undefined => findSection(sections, title)
  const lead = intro.replace(/^\s*#\s[^\n]*\n?/, '').trim()
  const leadHtml = lead ? (await render(lead)).html : ''
  const others = sections.filter((section) => !KNOWN.includes(section.heading.toLowerCase()))
  const [install, problem, how, editors, fit, start] = ['install', 'problem', 'how it works', 'for editors', 'fit', 'get started'].map(find)
  // In an editor's preview, each band carries the section it renders (Live marks)
  const marks = (section: Section | undefined): KranthoMarks | undefined => section && kranthoSection(home, section.heading)
  const capabilities = find('capabilities')
  const stackAndHost = find('your stack, your host')
  const questionsSection = find('questions')

  return (
    <>
      <SeoJsonLd collection="landing" slug="home" />
      <SectionHash selector="main section[id]" />
      <Hero home={home} />
      {leadHtml && (
        <div className="container landing-intro" {...kranthoSection(home, LEAD_SECTION)}>
          <Html html={leadHtml} className="landing-statement" />
        </div>
      )}
      {install && <Install section={install} marks={kranthoSection(home, install.heading)} />}
      {problem && <Problem section={problem} marks={kranthoSection(home, problem.heading)} />}
      {how && <HowItWorks section={how} marks={kranthoSection(home, how.heading)} />}
      <Capabilities features={features} section={capabilities} marks={marks(capabilities)} />
      <StackAndHost stacks={stacks} hosts={hosts} section={stackAndHost} marks={marks(stackAndHost)} />
      {editors && <ForEditors section={editors} marks={kranthoSection(home, editors.heading)} />}
      {fit && <Fit section={fit} marks={kranthoSection(home, fit.heading)} />}
      {others.map((section) => (
        <Prose key={section.heading} section={section} marks={kranthoSection(home, section.heading)} />
      ))}
      <Questions items={questions} section={questionsSection} marks={marks(questionsSection)} />
      {start && <GetStarted home={home} section={start} marks={kranthoSection(home, start.heading)} />}
      <HowMade
        template="app/(site)/[[...slug]]/landing.tsx"
        sources={[
          { collection: 'landing', slug: 'home', doc: home },
          listed('features', features),
          listed('stacks', stacks),
          listed('hosts', hosts),
          listed('faq', questions),
        ]}
      />
    </>
  )
}
