import { type KranthoMarks, kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { text } from '../../lib/content'
import { routeOf } from '../../lib/routes'
import { type AreaGroup, HOME_SLUG } from './docs-areas'
import { Icon } from './icons'

// The docs sidebar: every published docs page, grouped by area. Wide screens
// show it as a sticky column; narrow screens get the same list inside a
// <details> "Documentation menu" — two server-rendered copies, one hidden by
// CSS, so the menu needs no client JavaScript.

function DocsNavList({
  groups,
  current,
  idPrefix,
}: {
  groups: AreaGroup[]
  current: string
  /** Keeps label ids unique between the menu and the column copy */
  idPrefix: string
}): React.ReactElement {
  return (
    <>
      <Link
        href="/docs"
        className="docs-nav__home"
        aria-current={current === HOME_SLUG ? 'page' : undefined}
      >
        <Icon name="book" size={16} />
        Overview
      </Link>
      {groups.map(({ area, docs }) => (
        <div key={area.id} className="docs-nav__group">
          <p className="docs-nav__label" id={`${idPrefix}-${area.id}`}>
            <Icon name={area.icon} size={15} />
            {area.label}
          </p>
          <ul className="docs-nav__list" aria-labelledby={`${idPrefix}-${area.id}`}>
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={routeOf('docs', doc.slug)}
                  className="docs-nav__link"
                  aria-current={doc.slug === current ? 'page' : undefined}
                  {...kranthoField(doc, 'title')}
                >
                  {text(doc, 'title')}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export function DocsSidebar({
  groups,
  current,
  currentTitle,
  currentMarks,
}: {
  groups: AreaGroup[]
  /** The slug of the page being read */
  current: string
  /** Shown in the collapsed menu so readers see where they are */
  currentTitle?: string
  /** The Live marks of the field `currentTitle` comes from */
  currentMarks?: KranthoMarks | undefined
}): React.ReactElement {
  return (
    <div className="docs-sidebar">
      <details className="docs-menu">
        <summary className="docs-menu__summary">
          <span className="docs-menu__title">Documentation menu</span>
          {currentTitle && (
            <span className="docs-menu__current" {...currentMarks}>
              {currentTitle}
            </span>
          )}
        </summary>
        <nav className="docs-nav docs-nav--menu" aria-label="Documentation">
          <DocsNavList groups={groups} current={current} idPrefix="docs-menu" />
        </nav>
      </details>
      <nav className="docs-nav docs-nav--column" aria-label="Documentation">
        <DocsNavList groups={groups} current={current} idPrefix="docs-column" />
      </nav>
    </div>
  )
}
