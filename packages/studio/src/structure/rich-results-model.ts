import type { PageSearchFeature, PageSeoSummary, SeoReader } from '../lib/api-seo.js'
import type { CatalogType } from '../lib/api-types.js'
import { dataModePath, structureScopesPath } from '../lib/paths.js'

/**
 * Rich results across the site, from the readers' own rules as the API
 * applies them (`GET /api/seo/findings`: every live page in the default
 * locale, each with the features of the active readers its entities can
 * appear in), and from the catalog, whose features are Google's rules: a
 * feature no live page states an entity for yet still has its card, with
 * nothing applicable. A feature a reader has retired is never listed by the
 * API or the catalog's offer, and never shown here.
 */

/** The reader whose rules the catalog's features are */
const CATALOG_READER = 'google'

/** A live page, as the findings name it */
export interface PageRef {
  collection: string
  slug: string
  path: string
}

/** A property a feature needs that some pages lack, and where it is set */
export interface MissingProperty {
  /** The property, or `a | b` when either will do */
  property: string
  /** The Schema.org type it belongs on */
  type: string
  pages: PageRef[]
  /** Where to set it: the site entities for a site entity, else the first page's Data mode */
  fix: string
  /** Whether the entity is a site entity, so one value fixes every page */
  site: boolean
}

/** One feature of one reader, across the live pages that state an entity for it */
export interface RichCard {
  key: string
  reader: string
  readerName: string
  feature: string
  status: PageSearchFeature['status']
  /** Live pages whose structured data states an entity for the feature */
  applicable: number
  /** Of those, the pages with an entity that has everything the feature needs */
  eligible: number
  missing: MissingProperty[]
  conditions: string[]
  /** The documentation the reader's rule comes from */
  source: string
  /** The Schema.org types the catalog gives the feature; empty when it names none */
  types: string[]
}

interface Draft {
  card: RichCard
  pages: Map<string, boolean>
}

function pageRef(page: PageSeoSummary): PageRef {
  return { collection: page.collection, slug: page.slug, path: page.path }
}

function readerName(readers: readonly SeoReader[], id: string): string {
  return readers.find((reader) => reader.id === id)?.name ?? id
}

function newDraft(feature: PageSearchFeature, readers: readonly SeoReader[]): Draft {
  return {
    pages: new Map(),
    card: {
      key: `${feature.reader}:${feature.feature}`,
      reader: feature.reader,
      readerName: readerName(readers, feature.reader),
      feature: feature.feature,
      status: feature.status,
      applicable: 0,
      eligible: 0,
      missing: [],
      conditions: [...feature.conditions],
      source: feature.source,
      types: [feature.type],
    },
  }
}

/** Record what one page's entity lacks; one line per property, every page that lacks it */
function addMissing(
  card: RichCard,
  feature: PageSearchFeature,
  page: PageSeoSummary,
  siteTypes: ReadonlySet<string>,
): void {
  const site = siteTypes.has(feature.type)
  for (const property of feature.missing) {
    let line = card.missing.find((m) => m.property === property && m.type === feature.type)
    if (!line) {
      const fix = site ? structureScopesPath('site') : dataModePath(page.collection, page.slug)
      line = { property, type: feature.type, pages: [], fix, site }
      card.missing.push(line)
    }
    if (!line.pages.some((p) => p.collection === page.collection && p.slug === page.slug)) {
      line.pages.push(pageRef(page))
    }
  }
}

/** A card per feature of the live pages, with the pages each one applies to */
function pageDrafts(
  pages: readonly PageSeoSummary[],
  readers: readonly SeoReader[],
  siteTypes: ReadonlySet<string>,
): Map<string, Draft> {
  const drafts = new Map<string, Draft>()
  for (const page of pages) {
    for (const feature of page.features) {
      const key = `${feature.reader}:${feature.feature}`
      const draft = drafts.get(key) ?? newDraft(feature, readers)
      drafts.set(key, draft)
      if (!draft.card.types.includes(feature.type)) draft.card.types.push(feature.type)
      const pageKey = `${page.collection}/${page.slug}`
      draft.pages.set(pageKey, (draft.pages.get(pageKey) ?? false) || feature.eligible)
      addMissing(draft.card, feature, page, siteTypes)
    }
  }
  return drafts
}

/**
 * Add a card for each feature the catalog lists as shown (active or
 * restricted) that no live page states an entity for yet — while its reader
 * is one of the site's
 */
function addCatalogDrafts(
  drafts: Map<string, Draft>,
  catalog: readonly CatalogType[],
  readers: readonly SeoReader[],
): void {
  if (!readers.some((reader) => reader.id === CATALOG_READER)) return
  for (const type of catalog) {
    const status = type.richResultStatus
    if (!type.richResult || (status !== 'active' && status !== 'restricted')) continue
    const key = `${CATALOG_READER}:${type.richResult}`
    const known = drafts.get(key)
    if (known) {
      if (known.pages.size === 0 && !known.card.types.includes(type.type))
        known.card.types.push(type.type)
      continue
    }
    const feature: PageSearchFeature = {
      reader: CATALOG_READER,
      feature: type.richResult,
      type: type.type,
      status,
      eligible: false,
      missing: [],
      conditions: [],
      source: type.docsUrl,
    }
    drafts.set(key, newDraft(feature, readers))
  }
}

/**
 * One card per feature the readers' rules show — those the live pages can
 * appear in, then those no page states an entity for yet — in the readers'
 * order: how many pages it applies to, how many are eligible, and what the
 * others lack. `siteTypes` are the types only a site entity has.
 */
export function richCards(
  pages: readonly PageSeoSummary[],
  readers: readonly SeoReader[],
  siteTypes: ReadonlySet<string>,
  catalog: readonly CatalogType[] = [],
): RichCard[] {
  const drafts = pageDrafts(pages, readers, siteTypes)
  addCatalogDrafts(drafts, catalog, readers)
  const order = (card: RichCard): number => {
    const index = readers.findIndex((r) => r.id === card.reader)
    return index < 0 ? readers.length : index
  }
  const unused = (card: RichCard): number => (card.applicable === 0 ? 1 : 0)
  return [...drafts.values()]
    .map(({ card, pages: seen }) => ({
      ...card,
      applicable: seen.size,
      eligible: [...seen.values()].filter(Boolean).length,
    }))
    .sort(
      (a, b) => order(a) - order(b) || unused(a) - unused(b) || a.feature.localeCompare(b.feature),
    )
}

/** The rich results across the site: pages × features eligible, out of those that apply */
export function richTotals(cards: readonly RichCard[]): { eligible: number; applicable: number } {
  return cards.reduce(
    (sum, card) => ({
      eligible: sum.eligible + card.eligible,
      applicable: sum.applicable + card.applicable,
    }),
    { eligible: 0, applicable: 0 },
  )
}

/** A card's state in words, so it never rests on colour */
export function cardState(
  card: RichCard,
): 'eligible' | 'partly' | 'not-eligible' | 'conditional' | 'unused' {
  if (card.status === 'restricted') return 'conditional'
  if (card.applicable === 0) return 'unused'
  if (card.eligible === card.applicable) return 'eligible'
  return card.eligible === 0 ? 'not-eligible' : 'partly'
}
