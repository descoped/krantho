import Link from 'next/link'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { page, text, type Summary } from '../../../../lib/content'
import { type BodySection, findSection, LEAD_SECTION, splitSections } from '@krantho/core'
import { type KranthoMarks, kranthoField, kranthoSection } from '@krantho/core/marks'
import { routeOf } from '../../../../lib/routes'
import { AREAS, type Area, docsIndex, groupByArea } from '../../../components/docs-areas'
import { HowMade } from '../../../components/how-made'
import { Icon } from '../../../components/icons'
import { Markdown } from '../../../components/markdown'

// The docs home at /docs, from the `index` docs document: its intro, then one
// card per area. The index document has a `##` section per area titled exactly
// like the area's label — that section is the area's blurb; the area's pages are
// listed under it. Sections that name no area render as prose after the grid.

const TEMPLATE = 'app/(site)/docs/[[...slug]]/page.tsx'

function AreaCard({
  area,
  blurb,
  docs,
  marks,
}: {
  area: Area
  blurb?: BodySection | undefined
  docs: Summary[]
  /** The Live marks of the section `blurb` is */
  marks?: KranthoMarks | undefined
}): React.ReactElement {
  return (
    <section className="docs-area card" id={`area-${area.id}`} aria-labelledby={`area-${area.id}-title`} {...marks}>
      <div className="docs-area__head">
        <span className="docs-area__icon" aria-hidden="true">
          <Icon name={area.icon} size={22} />
        </span>
        <h2 className="docs-area__title" id={`area-${area.id}-title`}>
          {area.label}
        </h2>
      </div>
      {blurb?.markdown && <Markdown source={blurb.markdown} className="docs-area__blurb" />}
      {docs.length > 0 && (
        <ul className="docs-area__list">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link href={routeOf('docs', doc.slug)} className="docs-area__link" {...kranthoField(doc, 'title')}>
                {text(doc, 'title')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export async function DocsHome(): Promise<React.ReactElement> {
  const [home, { docs }] = await Promise.all([page('docs', 'index'), docsIndex()])
  const { lead: intro, sections } = splitSections(home.rawContent)
  const groups = groupByArea(docs)
  const labels = new Set(AREAS.map((area) => area.label.toLowerCase()))
  const other = sections.filter((section) => !labels.has(section.heading.toLowerCase()))
  const areas = AREAS.map((area) => ({
    area,
    blurb: findSection(sections, area.label),
    docs: groups.find((group) => group.area.id === area.id)?.docs ?? [],
  })).filter(({ blurb, docs: pages }) => blurb || pages.length > 0)
  const [start] = areas.flatMap(({ docs: pages }) => pages)

  return (
    <>
      <SeoJsonLd collection="docs" slug="index" structure={{ kind: 'collection' }} />
      <div className="docs-home">
        <header className="container container--wide docs-home__hero">
          <h1 className="docs-home__title" {...kranthoField(home, 'title')}>
            {text(home, 'title')}
          </h1>
          {text(home, 'description') && (
            <p className="lede docs-home__lede" {...kranthoField(home, 'description')}>
              {text(home, 'description')}
            </p>
          )}
          {intro && <Markdown source={intro} className="prose docs-home__intro" marks={kranthoSection(home, LEAD_SECTION)} />}
          {start && (
            <div className="docs-home__actions">
              <Link href={routeOf('docs', start.slug)} className="button button--primary" {...kranthoField(start, 'title')}>
                {text(start, 'title')}
                <Icon name="arrow" size={16} />
              </Link>
            </div>
          )}
        </header>
        <div className="container container--wide docs-home__areas">
          {areas.map(({ area, blurb, docs: pages }) => (
            <AreaCard key={area.id} area={area} blurb={blurb} docs={pages} marks={blurb && kranthoSection(home, blurb.heading)} />
          ))}
        </div>
        {other.length > 0 && (
          <div className="container container--wide docs-home__more">
            {other.map((section) => (
              <Markdown
                key={section.heading}
                source={`## ${section.heading}\n\n${section.markdown}`}
                className="prose"
                marks={kranthoSection(home, section.heading)}
              />
            ))}
          </div>
        )}
      </div>
      <HowMade template={TEMPLATE} sources={[{ collection: 'docs', slug: 'index', doc: home }]} />
    </>
  )
}
