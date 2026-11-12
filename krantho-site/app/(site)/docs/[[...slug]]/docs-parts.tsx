import type { PageStructure, TrailItem } from '@krantho/core'
import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { list, text, type Summary } from '../../../../lib/content'
import { stackLabel } from '../../../../lib/markdown'
import { routeOf } from '../../../../lib/routes'
import { areaOf, groupByArea, type Area } from '../../../components/docs-areas'
import { Icon } from '../../../components/icons'

// The parts of a docs page around its body — each one reads a field of the docs
// content template and is left out when that field is empty.

const LEVELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/**
 * What a docs page shows of its place in the docs, and states in its structured
 * data: the trail Docs › its area › the page, and its position in the area
 */
export function docsStructure(doc: Summary, docs: Summary[], area: Area | undefined): PageStructure {
  const title = text(doc, 'title')
  const areaUrl = area && `/docs#area-${area.id}`
  const trail: TrailItem[] = [
    { name: 'Docs', url: '/docs' },
    ...(area && areaUrl ? [{ name: area.label, url: areaUrl }] : []),
    { name: title },
  ]
  const group = groupByArea(docs).find((candidate) => candidate.area.id === area?.id)
  const position = group ? group.docs.findIndex((candidate) => candidate.slug === doc.slug) + 1 : 0
  if (!area || !areaUrl || position === 0) return { trail }
  return { trail, sequence: { partOf: { name: area.label, url: areaUrl }, position } }
}

/** The trail to `doc`: its area and its own title carry their fields' Live marks */
export function Breadcrumb({ trail, doc }: { trail: readonly TrailItem[]; doc: Summary }): React.ReactElement {
  const area = areaOf(doc)?.label
  return (
    <nav className="docs-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {trail.map((step) => (
          <li key={step.name}>
            {step.url ? (
              <Link href={step.url} {...(step.name === area ? kranthoField(doc, 'area') : {})}>
                {step.name}
              </Link>
            ) : (
              <span aria-current="page" {...kranthoField(doc, 'title')}>
                {step.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Level, the stacks the page applies to, and the version it arrived in */
export function MetaRow({ doc }: { doc: Summary }): React.ReactElement | null {
  const level = LEVELS[text(doc, 'level')]
  const stacks = list(doc, 'stacks')
  const since = text(doc, 'since')
  if (!level && stacks.length === 0 && !since) return null
  return (
    <div className="docs-meta">
      {level && (
        <span className="badge" {...kranthoField(doc, 'level')}>
          {level}
        </span>
      )}
      {stacks.length > 0 && (
        <span className="docs-meta__stacks" {...kranthoField(doc, 'stacks')}>
          <span className="docs-meta__label">Applies to</span>
          {stacks.map((stack) => (
            <span key={stack} className="badge badge--accent">
              {stackLabel(stack)}
            </span>
          ))}
        </span>
      )}
      {since && (
        <span className="badge docs-meta__since" {...kranthoField(doc, 'since')}>
          Since {since}
        </span>
      )}
    </div>
  )
}

/** "You'll need": the prerequisite pages, read before this one (`from`'s `prerequisites`) */
export function Prerequisites({ docs, from }: { docs: Summary[]; from: Summary }): React.ReactElement | null {
  if (docs.length === 0) return null
  return (
    <aside className="docs-needs" aria-labelledby="docs-needs-title" {...kranthoField(from, 'prerequisites')}>
      <p className="docs-needs__title" id="docs-needs-title">
        <Icon name="check" size={16} />
        You&apos;ll need
      </p>
      <ul className="docs-needs__list">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link href={routeOf('docs', doc.slug)} {...kranthoField(doc, 'title')}>
              {text(doc, 'title')}
            </Link>
            {text(doc, 'description') && (
              <span className="docs-needs__why" {...kranthoField(doc, 'description')}> — {text(doc, 'description')}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** The pages to read next (`from`'s `next`) */
export function NextSteps({ docs, from }: { docs: Summary[]; from: Summary }): React.ReactElement | null {
  if (docs.length === 0) return null
  return (
    <section className="docs-next" aria-labelledby="docs-next-steps" {...kranthoField(from, 'next')}>
      <h2 id="docs-next-steps" className="docs-block-title">
        Next steps
      </h2>
      <div className="docs-next__grid">
        {docs.map((doc) => (
          <Link key={doc.slug} href={routeOf('docs', doc.slug)} className="card docs-next__card">
            <span className="docs-next__title" {...kranthoField(doc, 'title')}>
              {text(doc, 'title')}
            </span>
            {text(doc, 'description') && (
              <span className="docs-next__text" {...kranthoField(doc, 'description')}>
                {text(doc, 'description')}
              </span>
            )}
            <span className="docs-next__arrow" aria-hidden="true">
              <Icon name="arrow" size={18} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Pages on related topics (`from`'s `related`) */
export function Related({ docs, from }: { docs: Summary[]; from: Summary }): React.ReactElement | null {
  if (docs.length === 0) return null
  return (
    <section className="docs-related" aria-labelledby="docs-related" {...kranthoField(from, 'related')}>
      <h2 id="docs-related" className="docs-block-title">
        Related
      </h2>
      <ul className="docs-related__list">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link href={routeOf('docs', doc.slug)} className="link-arrow" {...kranthoField(doc, 'title')}>
              {text(doc, 'title')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Previous and next page in the reading order of the whole documentation */
export function Pager({ previous, next }: { previous?: Summary | undefined; next?: Summary | undefined }): React.ReactElement | null {
  if (!previous && !next) return null
  return (
    <nav className="docs-pager" aria-label="Previous and next page">
      {previous ? (
        <Link href={routeOf('docs', previous.slug)} className="docs-pager__link" rel="prev">
          <span className="docs-pager__label">Previous</span>
          <span className="docs-pager__title" {...kranthoField(previous, 'title')}>
            {text(previous, 'title')}
          </span>
        </Link>
      ) : null}
      {next && (
        <Link href={routeOf('docs', next.slug)} className="docs-pager__link docs-pager__link--next" rel="next">
          <span className="docs-pager__label">Next</span>
          <span className="docs-pager__title" {...kranthoField(next, 'title')}>
            {text(next, 'title')}
          </span>
        </Link>
      )}
    </nav>
  )
}
