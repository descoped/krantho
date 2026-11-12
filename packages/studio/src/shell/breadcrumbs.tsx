import { ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link, matchPath, useLocation, useMatches } from 'react-router'
import { collectionLabel } from '../lib/format.js'
import { collectionPath } from '../lib/paths.js'
import { SETUP_TABS, STRUCTURE_TABS } from './destinations.js'
import { isNotFoundHandle, useIsMissing } from './not-found.js'
import './breadcrumbs.css'

/** One step of the trail; the last one is the current screen and has no link */
export interface Crumb {
  label: string
  path?: string | undefined
}

type Params = Readonly<Record<string, string | undefined>>

const SITE: Crumb = { label: 'Site', path: '/site' }
const STRUCTURE: Crumb = { label: 'Structure', path: '/structure' }
const SETUP: Crumb = { label: 'Setup', path: '/setup' }
const MEDIA: Crumb = { label: 'Media', path: '/media' }

function collectionCrumb(collection: string): Crumb {
  return { label: collectionLabel(collection), path: collectionPath(collection) }
}

function structureTabLabel(tab: string): string {
  return STRUCTURE_TABS.find((entry) => entry.id === tab)?.label ?? tab
}

function setupTabLabel(tab: string): string {
  return SETUP_TABS.find((entry) => entry.id === tab)?.label ?? tab
}

/** The trail of each route, most specific pattern first */
const TRAILS: readonly { pattern: string; trail: (p: Params) => Crumb[] }[] = [
  { pattern: '/', trail: () => [{ label: 'Pulse' }] },
  { pattern: '/site', trail: () => [{ label: 'Site' }] },
  {
    pattern: '/site/:collection',
    trail: (p) => [SITE, { label: collectionLabel(p.collection ?? '') }],
  },
  {
    pattern: '/site/:collection/:slug',
    trail: (p) => [SITE, collectionCrumb(p.collection ?? ''), { label: p.slug ?? '' }],
  },
  {
    pattern: '/new/:collection',
    trail: (p) => [SITE, collectionCrumb(p.collection ?? ''), { label: 'New' }],
  },
  { pattern: '/layout/:slug', trail: (p) => [SITE, { label: 'Layout' }, { label: p.slug ?? '' }] },
  { pattern: '/structure', trail: () => [STRUCTURE, { label: structureTabLabel('graph') }] },
  {
    pattern: '/structure/:tab',
    trail: (p) => [STRUCTURE, { label: structureTabLabel(p.tab ?? '') }],
  },
  { pattern: '/setup', trail: () => [{ label: 'Setup' }] },
  { pattern: '/setup/:tab', trail: (p) => [SETUP, { label: setupTabLabel(p.tab ?? '') }] },
  { pattern: '/media', trail: () => [{ label: 'Media' }] },
  { pattern: '/media/:id/edit', trail: () => [MEDIA, { label: 'Edit image' }] },
]

const NOT_FOUND_TRAIL: readonly Crumb[] = [{ label: 'Not found' }]

/**
 * The breadcrumb trail of a route path; an unknown path reads "Not found". The
 * caller passes `notFound` when the router fell through to the not-found screen —
 * a hidden destination or tab is then never named.
 */
export function crumbsFor(pathname: string, notFound = false): readonly Crumb[] {
  if (notFound) return NOT_FOUND_TRAIL
  for (const { pattern, trail } of TRAILS) {
    const match = matchPath(pattern, pathname)
    if (match) return trail(match.params)
  }
  return NOT_FOUND_TRAIL
}

/** The trail of the current route; separators are decorative */
export function Breadcrumbs(): ReactElement {
  const { pathname } = useLocation()
  const routed = useMatches().some((match) => isNotFoundHandle(match.handle))
  const missing = useIsMissing(pathname)
  const crumbs = crumbsFor(pathname, routed || missing)
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1
          return (
            <li
              key={crumbs
                .slice(0, index + 1)
                .map((c) => c.label)
                .join('/')}
              className="breadcrumbs-item"
            >
              {index > 0 && <ChevronRight className="breadcrumbs-separator" aria-hidden="true" />}
              {current ? (
                <span className="breadcrumbs-current" aria-current="page">
                  {crumb.label}
                </span>
              ) : crumb.path ? (
                <Link to={crumb.path} className="breadcrumbs-link">
                  {crumb.label}
                </Link>
              ) : (
                <span className="breadcrumbs-text">{crumb.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
