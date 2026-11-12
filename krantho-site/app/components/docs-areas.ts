import { list, num, summaries, text, type Summary } from '../../lib/content'
import type { IconName } from './icons'

// The shape of the Krantho Developer Documentation: the areas the sidebar groups
// pages by, in reading order, and the one reading order every docs page shares
// (sidebar, previous/next links, llms.txt). The `area` field of each docs
// document places it; `order` places it within the area.

export interface Area {
  id: string
  label: string
  icon: IconName
}

export const AREAS: readonly Area[] = [
  { id: 'get-started', label: 'Get started', icon: 'compass' },
  { id: 'concepts', label: 'Concepts', icon: 'layers' },
  { id: 'guides', label: 'Guides', icon: 'book' },
  { id: 'deploy', label: 'Deploy', icon: 'deploy' },
  { id: 'reference', label: 'Reference', icon: 'config' },
  { id: 'skills', label: 'Agent skills', icon: 'skills' },
] as const

/** The docs home document — rendered at /docs, not listed under an area */
export const HOME_SLUG = 'index'

export function areaOf(doc: Summary): Area | undefined {
  const id = text(doc, 'area')
  return AREAS.find((area) => area.id === id)
}

export interface AreaGroup<T extends Summary = Summary> {
  area: Area
  docs: T[]
}

/** Published docs pages grouped by area, each group by `order` then title */
export function groupByArea<T extends Summary>(docs: T[]): AreaGroup<T>[] {
  return AREAS.map((area) => ({
    area,
    docs: docs
      .filter((doc) => doc.slug !== HOME_SLUG && text(doc, 'area') === area.id)
      .sort((a, b) => num(a, 'order') - num(b, 'order') || text(a, 'title').localeCompare(text(b, 'title'))),
  })).filter((group) => group.docs.length > 0)
}

/** Every docs page in reading order: the home first, then area by area */
export function readingOrder<T extends Summary>(docs: T[]): T[] {
  const home = docs.find((doc) => doc.slug === HOME_SLUG)
  const pages = groupByArea(docs).flatMap((group) => group.docs)
  return home ? [home, ...pages] : pages
}

/** All published docs pages, once per render, with a lookup by slug */
export async function docsIndex(): Promise<{ docs: Summary[]; bySlug: Map<string, Summary> }> {
  const docs = await summaries('docs')
  return { docs, bySlug: new Map(docs.map((doc) => [doc.slug, doc])) }
}

/** The published docs a slug-array field points at, in the field's order; unknown slugs are left out */
export function refs(doc: Summary, field: string, bySlug: Map<string, Summary>): Summary[] {
  return list(doc, field)
    .map((slug) => bySlug.get(slug))
    .filter((found): found is Summary => found !== undefined)
}
