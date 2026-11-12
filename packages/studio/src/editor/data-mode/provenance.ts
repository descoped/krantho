import type { ResolvedEntity, ResolvedPropertyView, ValueScope } from '../../lib/api-types.js'
import { isRecord } from '../../lib/guards.js'
import type { EmittedNode } from './graph-config.js'

/**
 * Where each value of the page's structured data comes from, as Data mode
 * shows it: the scope `GET /api/seo/resolved` reports per property, named the
 * way the Structure destination names the four scopes, plus computed and linked.
 */

export interface ScopeInfo {
  label: string
  /** What the scope means, for the chip's description */
  meaning: string
}

export const VALUE_SCOPES: Readonly<Record<ValueScope, ScopeInfo>> = {
  site: { label: 'site', meaning: 'From the site entities' },
  collection: { label: 'collection', meaning: 'From the collection archetype' },
  route: { label: 'URL pattern', meaning: 'From a URL-pattern override' },
  document: { label: 'document', meaning: 'Set in this document' },
  computed: { label: 'computed', meaning: 'Computed from the page: no one typed it' },
  linked: { label: 'linked', meaning: 'A reference to another entity, by its @id' },
}

/** An entity's own scope: shared by every page (a site entity), or this page's */
export type EntityScope = 'site' | 'page'

export const ENTITY_SCOPES: Readonly<Record<EntityScope, ScopeInfo>> = {
  site: { label: 'site', meaning: 'A site entity: every page emits it' },
  page: { label: 'page', meaning: "This page's own entity, from its archetype" },
}

/** One property row of an entity: its key, its value as text, and where it comes from */
export interface PropertyRow {
  key: string
  /** The value as Studio shows it: text as is, a reference by its @id, anything else as JSON */
  text: string
  scope: ValueScope
  /** Where the value was read, or how it was computed */
  origin: string
  /** The @ids the value references, in order: what a linked value leads to */
  references: string[]
  /** The type fixes it: the SEO settings cannot set it */
  fixed: boolean
}

/** One entity of the graph, ready to show */
export interface EntityView {
  id: string
  type: string
  scope: EntityScope
  rows: PropertyRow[]
}

function referenceId(value: unknown): string | null {
  if (!isRecord(value)) return null
  const id = value['@id']
  return typeof id === 'string' ? id : null
}

/** The @ids a value references: one reference, or a list of them */
export function referencesOf(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.map(referenceId).filter((id): id is string => id !== null)
}

/** A value as one line of text: a string as is, references by their @id, the rest as JSON */
export function valueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const references = referencesOf(value)
  const values = Array.isArray(value) ? value : [value]
  if (references.length > 0 && references.length === values.length) return references.join(', ')
  return JSON.stringify(value) ?? ''
}

/** How krantho adds a value no scope set: while it composes the page (a decorator, a link) */
export const COMPOSED_ORIGIN = 'Added by krantho when it composes the page'

/** What the entity list reads: the emitted graph, the resolved entities, and which types are the site's */
export interface EntitySources {
  /** The nodes of the page's `@graph`, as composed */
  nodes: readonly EmittedNode[]
  /** The entities `GET /api/seo/resolved` reports, with each value's scope */
  resolved: readonly ResolvedEntity[]
  /** The catalog's site-level types */
  siteTypes: ReadonlySet<string>
}

function nodeType(node: EmittedNode): string {
  const type = node['@type']
  if (typeof type === 'string') return type
  return Array.isArray(type) && typeof type[0] === 'string' ? type[0] : 'Thing'
}

/** One emitted value as a row: its scope and origin where the API resolved it, computed otherwise */
function rowOf(key: string, value: unknown, entity: ResolvedEntity | undefined): PropertyRow {
  const resolved = entity?.properties.find((property) => property.property === key)
  return {
    key,
    text: valueText(value),
    scope: resolved?.scope ?? 'computed',
    origin: resolved?.origin ?? COMPOSED_ORIGIN,
    references: referencesOf(value),
    fixed: resolved ? !resolved.editable : false,
  }
}

/**
 * An entity's own scope: the level the API resolved it at; for a node krantho
 * added while composing, the site's when its type is a site-level type or it
 * comes before the page's first entity (site entities are composed first),
 * the page's otherwise
 */
function scopeOf(
  node: EmittedNode,
  index: number,
  entity: ResolvedEntity | undefined,
  sources: EntitySources,
  firstPageIndex: number,
): EntityScope {
  if (entity) return entity.level === 'site' ? 'site' : 'page'
  if (sources.siteTypes.has(nodeType(node))) return 'site'
  return index < firstPageIndex ? 'site' : 'page'
}

/** Where the page's own entities start in the graph: the first node the API resolved for the document */
function firstPageNode(sources: EntitySources): number {
  const pageIds = new Set(
    sources.resolved.filter((entity) => entity.level === 'document').map((entity) => entity.id),
  )
  const index = sources.nodes.findIndex((node) => pageIds.has(String(node['@id'])))
  return index >= 0 ? index : 0
}

/** How narrow a value's scope is: a narrower one wins where two entities set the same property */
const SCOPE_RANK: Readonly<Record<ValueScope, number>> = {
  computed: 0,
  linked: 0,
  site: 1,
  collection: 2,
  route: 3,
  document: 4,
}

/** Two values of one property: the narrower scope's, and on a tie the later one, as composition merges them */
function winner(earlier: ResolvedPropertyView, later: ResolvedPropertyView): ResolvedPropertyView {
  return SCOPE_RANK[earlier.scope] > SCOPE_RANK[later.scope] ? earlier : later
}

/**
 * `/resolved` by `@id`, one entity per id. An id the resolution lists more
 * than once — the collection's entity and the document's of the same type,
 * which the composed graph merges into one node — is merged the same way:
 * every property of either, the narrower scope's value where both set one
 * (the document's wins), the later one on a tie; a document level wins.
 */
export function resolvedById(
  resolved: readonly ResolvedEntity[],
): ReadonlyMap<string, ResolvedEntity> {
  const byId = new Map<string, ResolvedEntity>()
  for (const entity of resolved) {
    const seen = byId.get(entity.id)
    if (!seen) {
      byId.set(entity.id, entity)
      continue
    }
    const properties = new Map(seen.properties.map((p) => [p.property, p]))
    for (const property of entity.properties) {
      const earlier = properties.get(property.property)
      properties.set(property.property, earlier ? winner(earlier, property) : property)
    }
    const level = seen.level === 'document' || entity.level === 'document' ? 'document' : 'site'
    byId.set(entity.id, { ...entity, level, properties: [...properties.values()] })
  }
  return byId
}

/**
 * Every node the page emits, in the graph's order, with every emitted value
 * as a row, joined to `/resolved` by `@id` for its scope and source
 */
export function nodeViews(sources: EntitySources): EntityView[] {
  const firstPage = firstPageNode(sources)
  const byId = resolvedById(sources.resolved)
  return sources.nodes.map((node, index): EntityView => {
    const id = typeof node['@id'] === 'string' ? node['@id'] : ''
    const entity = byId.get(id)
    const rows = Object.entries(node)
      .filter(([key]) => !key.startsWith('@'))
      .map(([key, value]) => rowOf(key, value, entity))
    return {
      id,
      type: nodeType(node),
      scope: scopeOf(node, index, entity, sources, firstPage),
      rows,
    }
  })
}

/** Every node the page emits, as Data mode lists it: the page's own first, then the site's */
export function entityViews(sources: EntitySources): EntityView[] {
  const views = nodeViews(sources)
  return [...views.filter((v) => v.scope === 'page'), ...views.filter((v) => v.scope === 'site')]
}

/** How many values come from each scope, in the table's order: the legend's counts */
export function scopeCounts(views: readonly EntityView[]): Array<[ValueScope, number]> {
  const counts = new Map<ValueScope, number>()
  for (const row of views.flatMap((view) => view.rows)) {
    counts.set(row.scope, (counts.get(row.scope) ?? 0) + 1)
  }
  return (Object.keys(VALUE_SCOPES) as ValueScope[])
    .filter((scope) => counts.has(scope))
    .map((scope) => [scope, counts.get(scope) ?? 0])
}
