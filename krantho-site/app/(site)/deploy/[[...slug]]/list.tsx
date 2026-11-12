import { type BodySection, LEAD_SECTION, splitSections } from '@krantho/core'
import { type KranthoMarks, kranthoField, kranthoSection } from '@krantho/core/marks'
import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { type Summary, list, maybe, text, summaries } from '../../../../lib/content'
import { slugify } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { splitCode } from '../../../../lib/split-code'
import { HowMade } from '../../../components/how-made'
import { Icon } from '../../../components/icons'
import { Html, Markdown, render } from '../../../components/markdown'
import { heroMarks, PageHero, withoutTitle } from '../../../components/page-hero'
import { CACHE_STRATEGIES, kindLabel, strategyOf } from './facts'
import '../../../styles/product.css'

// The deploy index: every published host side by side — what kind of host it is,
// how pages are cached there, and which frameworks, databases and media stores
// run on it — then a card per host. Hosts are listed by `order`, then title;
// the page prefers none of them. The page's lead follows the cards; each `##`
// section of the page body is a full-width band, its code and diagrams beside
// the text on wide screens.

function Values({ host, name }: { host: Summary; name: string }): React.ReactElement {
  const values = list(host, name)
  if (values.length === 0) return <span className="matrix__empty">—</span>
  return (
    <ul className="matrix__values">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  )
}

function Matrix({ hosts }: { hosts: Summary[] }): React.ReactElement {
  // Each row: its label, the host field it shows, and how a cell shows it
  const rows: [string, string, (host: Summary) => React.ReactNode][] = [
    ['Kind', 'kind', (host) => kindLabel(text(host, 'kind'))],
    ['Page cache', 'cache-strategy', (host) => <code className="strategy">{strategyOf(host).value}</code>],
    ['Frameworks', 'frameworks', (host) => <Values host={host} name="frameworks" />],
    ['Databases', 'databases', (host) => <Values host={host} name="databases" />],
    ['Media stores', 'media-stores', (host) => <Values host={host} name="media-stores" />],
  ]
  return (
    <div className="matrix" role="region" aria-label="Hosts compared" tabIndex={0}>
      <table className="matrix__table">
        <thead>
          <tr>
            <td className="matrix__corner" />
            {hosts.map((host) => (
              <th key={host.slug} scope="col">
                <Link href={routeOf('hosts', host.slug)} {...kranthoField(host, 'title')}>
                  {text(host, 'title')}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, field, cell]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {hosts.map((host) => (
                <td key={host.slug} {...kranthoField(host, field)}>
                  {cell(host)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Strategies(): React.ReactElement {
  return (
    <dl className="strategies">
      {Object.entries(CACHE_STRATEGIES).map(([value, explanation]) => (
        <div key={value} className="strategies__item">
          <dt>
            <code className="strategy">{value}</code>
          </dt>
          <dd>{explanation}</dd>
        </div>
      ))}
    </dl>
  )
}

async function Band({ section, marks }: { section: BodySection; marks: KranthoMarks }): Promise<React.ReactElement> {
  const split = splitCode(section.markdown)
  const [prose, code] = await Promise.all([render(split ? split.prose : section.markdown), split ? render(split.code) : undefined])
  const id = slugify(section.heading)
  return (
    <section className="section host-band" id={id} aria-labelledby={`${id}-title`} {...marks}>
      <div className={`container host-band__inner${code ? ' host-band__inner--split' : ''}`}>
        <div className="host-band__text">
          <h2 id={`${id}-title`} className="host-band__title">
            {section.heading}
          </h2>
          <Html html={prose.html} className="prose" />
        </div>
        {code && <Html html={code.html} className="host-band__code" />}
      </div>
    </section>
  )
}

export async function HostList(): Promise<React.ReactElement> {
  const [intro, hosts] = await Promise.all([maybe('pages', 'deploy'), summaries('hosts')])
  const { lead, sections } = splitSections(intro ? withoutTitle(intro.rawContent) : '')

  return (
    <>
      {intro && <SeoJsonLd collection="pages" slug="deploy" />}
      <PageHero
        eyebrow={text(intro, 'eyebrow') || undefined}
        title={text(intro, 'title') || 'Deploy'}
        lede={text(intro, 'description') || undefined}
        marks={heroMarks(intro, { eyebrow: 'eyebrow', title: 'title', lede: 'description' })}
      />

      {hosts.length > 0 && (
        <section className="section section--tight-top">
          <div className="container">
            <Matrix hosts={hosts} />
            <Strategies />
          </div>
        </section>
      )}

      <section className="section section--subtle">
        <div className="container">
          <ul className="host-grid">
            {hosts.map((host) => (
              <li key={host.slug}>
                <Link href={routeOf('hosts', host.slug)} className="card host-card">
                  <span className="host-card__top">
                    <span className="badge" {...kranthoField(host, 'kind')}>
                      {kindLabel(text(host, 'kind'))}
                    </span>
                    <code className="strategy" {...kranthoField(host, 'cache-strategy')}>
                      {strategyOf(host).value}
                    </code>
                  </span>
                  <h2 className="host-card__title" {...kranthoField(host, 'title')}>
                    {text(host, 'title')}
                  </h2>
                  <p className="host-card__description" {...kranthoField(host, 'description')}>
                    {text(host, 'description')}
                  </p>
                  <Icon name="arrow" size={18} className="host-card__arrow" />
                </Link>
              </li>
            ))}
          </ul>
          {lead && <Markdown source={lead} className="prose host-prose" marks={kranthoSection(intro, LEAD_SECTION)} />}
        </div>
      </section>

      {sections.map((section) => (
        <Band key={section.heading} section={section} marks={kranthoSection(intro, section.heading)} />
      ))}

      <HowMade
        template="app/(site)/deploy/[[...slug]]/list.tsx"
        sources={[
          { collection: 'pages', slug: 'deploy', doc: intro },
          ...hosts.map((host) => ({ collection: 'hosts', slug: host.slug, doc: host })),
        ]}
        jsonLd={Boolean(intro)}
      />
    </>
  )
}
