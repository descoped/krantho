/**
 * Pure data layer for the JSON-LD graph browser.
 *
 * Parses the composed `@graph` output from the SEO preview API, indexes
 * nodes by `@id`, builds a reverse-reference lookup, classifies the layout
 * into site-context / page / primary / linked sections, and classifies
 * individual properties against the Schema.org catalog for validation.
 *
 * No React, no DOM. Every function here is testable in isolation.
 */

import type { CatalogDetailResponse, CatalogType, PropertyDef } from './api-types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Internal edit key property name. Every node gets a `_ek` assigned at parse
 * time — a session-scoped shadow identity used by the edit buffer and
 * selection state. Completely independent of the JSON-LD `@id`.
 */
export const EDIT_KEY = '_ek' as const

/** A single Schema.org entity inside the composed `@graph`. */
export interface GraphNode {
  readonly '@type': string | readonly string[]
  readonly '@id'?: string
  /** Session-scoped edit key, assigned by `parseGraph()`. */
  readonly [EDIT_KEY]?: string
  readonly [property: string]: unknown
}

/**
 * Reverse-index entry: a node that references another node's `@id` through
 * a specific property.
 */
export interface GraphReference {
  readonly source: GraphNode
  readonly property: string
}

/**
 * Parsed graph model with indexes. Pure structural view — does not require
 * catalog knowledge.
 */
export interface GraphModel {
  /** Top-level nodes in `@graph` order. Embedded sub-entities are NOT lifted. */
  readonly nodes: readonly GraphNode[]
  /** `_ek` → node lookup. Every node has a `_ek` after `parseGraph()`. */
  readonly byEk: ReadonlyMap<string, GraphNode>
  /** `@id` → node lookup. Only nodes with semantic `@id`. Used for reference following. */
  readonly byId: ReadonlyMap<string, GraphNode>
  /** `@id` → list of nodes that reference it via any property. */
  readonly referencedBy: ReadonlyMap<string, readonly GraphReference[]>
  /**
   * The primary content entity, resolved by following `WebPage.mainEntity`
   * to its target node. `null` when no page node exists or the reference
   * cannot be resolved — layout classification can still assign a primary
   * through its fallback rules.
   */
  readonly primary: GraphNode | null
}

/** Section partitioning for the top-down browser layout. */
export interface GraphLayout {
  readonly siteContext: readonly GraphNode[]
  readonly page: GraphNode | null
  readonly primary: GraphNode | null
  readonly linked: readonly GraphNode[]
}

/** Schema.org catalog category (mirrors the six categories defined in `@krantho/seo`). */
export type CatalogCategory =
  | 'business'
  | 'content'
  | 'commerce'
  | 'people'
  | 'navigation'
  | 'reviews'

/** Human-readable labels for the six catalog categories. */
export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  business: 'Business & Organization',
  content: 'Content',
  commerce: 'Commerce & Services',
  people: 'People & Events',
  navigation: 'Navigation & Structure',
  reviews: 'Reviews & Ratings',
}

const CATEGORY_SET = new Set<CatalogCategory>(Object.keys(CATEGORY_LABELS) as CatalogCategory[])

/** Catalog importance with an added `'unknown'` state for properties outside the catalog. */
export type PropertyImportance = 'required' | 'recommended' | 'optional' | 'unknown'

/** Whether a property has a value or is missing. */
export type PropertyState = 'set' | 'missing'

/**
 * A classified property on an entity, ready for rendering. Combines the raw
 * value with catalog metadata, importance, set/missing state, and
 * cross-reference info.
 */
export interface PropertyClassification {
  readonly property: string
  readonly value: unknown
  readonly importance: PropertyImportance
  readonly state: PropertyState
  readonly def?: PropertyDef
  /** True when the value is a bare `{@id: string}` cross-reference. */
  readonly isReference: boolean
  /** The referenced `@id` when `isReference` is true. */
  readonly referenceId?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Schema.org page-like types that wrap a document. These belong in the
 * "Page" section of the layout, not in site context or primary.
 */
const PAGE_TYPES: ReadonlySet<string> = new Set([
  'WebPage',
  'AboutPage',
  'CheckoutPage',
  'CollectionPage',
  'ContactPage',
  'FAQPage',
  'ItemPage',
  'MedicalWebPage',
  'ProfilePage',
  'QAPage',
  'RealEstateListing',
  'SearchResultsPage',
])

// ---------------------------------------------------------------------------
// parseGraph
// ---------------------------------------------------------------------------

/**
 * Parse arbitrary JSON-LD input into an indexed `GraphModel`.
 *
 * Accepts the common shapes:
 * - `null` / `undefined` → empty model
 * - `{}` → empty model
 * - `{ '@context': ..., '@graph': [...] }` → use the wrapped array
 * - `{ '@type': ..., ... }` → treat as a single flat node
 * - `[...]` → treat as a bare node array
 *
 * Non-node entries and nodes without `@type` are filtered out. Node order
 * from the input `@graph` is preserved in `GraphModel.nodes`.
 */
export function parseGraph(data: unknown): GraphModel {
  const rawArray = toNodeArray(data)
  const nodes: GraphNode[] = []
  for (const raw of rawArray) {
    if (isGraphNode(raw)) {
      nodes.push(raw)
    }
  }

  // Assign edit keys — every node gets a session-scoped `_ek` that is
  // independent of the JSON-LD `@id`. The edit buffer and selection state
  // use `_ek` exclusively. `@id` remains a semantic user-editable property.
  assignEditKeys(nodes)

  const byEk = buildByEkIndex(nodes)
  const byId = buildByIdIndex(nodes)
  const referencedBy = buildReferencedByIndex(nodes)
  const primary = resolvePrimary(nodes, byId)

  return { nodes, byEk, byId, referencedBy, primary }
}

function toNodeArray(data: unknown): readonly unknown[] {
  if (data === null || data === undefined) return []
  if (Array.isArray(data)) return data
  if (typeof data !== 'object') return []

  const obj = data as Record<string, unknown>
  const graph = obj['@graph']
  if (Array.isArray(graph)) return graph
  if ('@type' in obj) return [obj]
  return []
}

function isGraphNode(value: unknown): value is GraphNode {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return '@type' in (value as Record<string, unknown>)
}

function buildByIdIndex(nodes: readonly GraphNode[]): ReadonlyMap<string, GraphNode> {
  const map = new Map<string, GraphNode>()
  for (const node of nodes) {
    const id = node['@id']
    if (typeof id === 'string') {
      map.set(id, node)
    }
  }
  return map
}

export function buildReferencedByIndex(
  nodes: readonly GraphNode[],
): ReadonlyMap<string, readonly GraphReference[]> {
  const map = new Map<string, GraphReference[]>()
  for (const node of nodes) {
    for (const [property, value] of Object.entries(node)) {
      if (
        property === '@type' ||
        property === '@id' ||
        property === '@context' ||
        property === EDIT_KEY
      )
        continue
      for (const targetId of collectReferenceIds(value)) {
        let bucket = map.get(targetId)
        if (!bucket) {
          bucket = []
          map.set(targetId, bucket)
        }
        bucket.push({ source: node, property })
      }
    }
  }
  return map
}

/**
 * Walk a value recursively and return every string `@id` found.
 * Used to build the reverse-reference index — catches both bare
 * `{@id: 'x'}` references and embedded entities that carry their own `@id`.
 */
export function collectReferenceIds(value: unknown): readonly string[] {
  if (value === null || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    const out: string[] = []
    for (const item of value) {
      for (const id of collectReferenceIds(item)) out.push(id)
    }
    return out
  }
  const obj = value as Record<string, unknown>
  const id = obj['@id']
  if (typeof id === 'string') {
    return [id]
  }
  const out: string[] = []
  for (const v of Object.values(obj)) {
    for (const nested of collectReferenceIds(v)) out.push(nested)
  }
  return out
}

function resolvePrimary(
  nodes: readonly GraphNode[],
  byId: ReadonlyMap<string, GraphNode>,
): GraphNode | null {
  const pageNode = nodes.find((n) => isPageNode(n))
  if (!pageNode) return null
  const refId = extractRefId(pageNode.mainEntity)
  if (refId === undefined) return null
  return byId.get(refId) ?? null
}

function isPageNode(node: GraphNode): boolean {
  const type = typeString(node['@type'])
  return type !== null && PAGE_TYPES.has(type)
}

/**
 * Return the first `@type` string on a node. Handles both string and
 * string-array forms (JSON-LD allows `@type` to be either).
 */
export function typeString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0]
  return null
}

// ---------------------------------------------------------------------------
// classifyGraphLayout
// ---------------------------------------------------------------------------

/**
 * Partition the graph's nodes into site-context / page / primary / linked
 * sections for the top-down browser layout.
 *
 * `siteLevelTypes` is a set of Schema.org `@type` names that should be
 * treated as site-scope (typically everything in the `business` category
 * plus `WebSite` and a `Person` that appears as site founder).
 */
export function classifyGraphLayout(
  model: GraphModel,
  siteLevelTypes: ReadonlySet<string>,
): GraphLayout {
  const siteContext: GraphNode[] = []
  const pages: GraphNode[] = []
  const remaining: GraphNode[] = []

  for (const node of model.nodes) {
    const type = typeString(node['@type'])
    if (type === null) continue
    if (PAGE_TYPES.has(type)) {
      pages.push(node)
    } else if (siteLevelTypes.has(type)) {
      siteContext.push(node)
    } else {
      remaining.push(node)
    }
  }

  const page = pages[0] ?? null
  // Prefer the page-resolved primary from the model; fall back to the first
  // non-site, non-page node.
  const primary = model.primary ?? remaining[0] ?? null
  const linked = remaining.filter((n) => n !== primary)

  return { siteContext, page, primary, linked }
}

// ---------------------------------------------------------------------------
// entityCategory
// ---------------------------------------------------------------------------

/**
 * Resolve the 6-category catalog classification for a node's primary
 * `@type`, or `null` if the type is not in the catalog.
 */
export function entityCategory(
  node: GraphNode,
  catalogTypes: readonly CatalogType[],
): CatalogCategory | null {
  const type = typeString(node['@type'])
  if (type === null) return null
  const entry = catalogTypes.find((t) => t.type === type)
  if (!entry) return null
  return CATEGORY_SET.has(entry.category as CatalogCategory)
    ? (entry.category as CatalogCategory)
    : null
}

// ---------------------------------------------------------------------------
// classifyNodeProperties
// ---------------------------------------------------------------------------

/**
 * Classify every property on a node against the catalog for its `@type`.
 *
 * The result includes both set properties (from the node itself) and unset
 * properties (from the catalog definition), each tagged with importance,
 * state, and — where applicable — the catalog `PropertyDef` metadata and
 * cross-reference info.
 *
 * When `detail` is `null` (the node's type isn't in the catalog), every
 * returned classification has `importance: 'unknown'`.
 */
export function classifyNodeProperties(
  node: GraphNode,
  detail: CatalogDetailResponse | null,
): readonly PropertyClassification[] {
  const properties = new Set<string>()
  for (const key of Object.keys(node)) {
    if (key === '@type' || key === '@id' || key === '@context' || key === EDIT_KEY) continue
    properties.add(key)
  }
  if (detail) {
    for (const def of detail.properties) {
      properties.add(def.property)
    }
  }

  const defByProperty = new Map<string, PropertyDef>()
  if (detail) {
    for (const d of detail.properties) {
      defByProperty.set(d.property, d)
    }
  }

  const result: PropertyClassification[] = []
  for (const property of properties) {
    const value = node[property]
    const def = defByProperty.get(property)
    const importance: PropertyImportance = def?.importance ?? 'unknown'
    const state: PropertyState = isValueSet(value) ? 'set' : 'missing'
    const isReference = isDirectReference(value)
    const referenceId = isReference ? extractRefId(value) : undefined
    const classification: PropertyClassification = {
      property,
      value,
      importance,
      state,
      isReference,
      ...(def ? { def } : {}),
      ...(referenceId !== undefined ? { referenceId } : {}),
    }
    result.push(classification)
  }
  return result
}

function isValueSet(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

function isDirectReference(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return typeof obj['@id'] === 'string'
}

function extractRefId(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>
  return typeof obj['@id'] === 'string' ? obj['@id'] : undefined
}

// ---------------------------------------------------------------------------
// orderedProperties
// ---------------------------------------------------------------------------

/** Count how many required properties are set vs total required. */
export function countRequired(classifications: readonly PropertyClassification[]): {
  requiredSet: number
  requiredTotal: number
} {
  let requiredSet = 0
  let requiredTotal = 0
  for (const c of classifications) {
    if (c.importance === 'required') {
      requiredTotal += 1
      if (c.state === 'set') requiredSet += 1
    }
  }
  return { requiredSet, requiredTotal }
}

/** Shorten an @id URI to its last meaningful segment. */
export function shortenId(id: string): string {
  const hash = id.lastIndexOf('#')
  if (hash !== -1) return id.slice(hash)
  const slash = id.lastIndexOf('/')
  if (slash !== -1 && slash < id.length - 1) return id.slice(slash)
  return id
}

// ---------------------------------------------------------------------------
// Edit keys (_ek) — session-scoped shadow identity system
// ---------------------------------------------------------------------------

/**
 * Assign a unique `_ek` (edit key) to every top-level node. Edit keys are
 * session-scoped shadow identifiers used by the edit buffer and selection
 * state. They are completely independent of the JSON-LD `@id` — the `@id`
 * remains a semantic, user-editable property that is never relied upon for
 * edit infrastructure.
 *
 * Keys are sequential strings: `"0"`, `"1"`, `"2"`, etc. They are stable
 * within a session because `parseGraph` is called once with server data.
 * When `applyBuffer` creates new node objects, it preserves `_ek` via
 * property spread.
 */
function assignEditKeys(nodes: GraphNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const mutable = nodes[i] as Record<string, unknown>
    mutable[EDIT_KEY] = String(i)
  }
}

export function buildByEkIndex(nodes: readonly GraphNode[]): ReadonlyMap<string, GraphNode> {
  const map = new Map<string, GraphNode>()
  for (const node of nodes) {
    const ek = node[EDIT_KEY]
    if (typeof ek === 'string') {
      map.set(ek, node)
    }
  }
  return map
}

/**
 * Build a mapping from edit key to config entity index.
 *
 * Correlates graph nodes (which have `_ek`) to config entities (which may
 * have `@id`, `@type`, and `role`). The matching uses `@id` when available,
 * then falls back to `@type` + `role`.
 *
 * This mapping is the bridge between the edit buffer (keyed by `_ek`) and
 * the config persistence (keyed by entity index). It is built once at load
 * time and used at save time.
 */
export function buildEkConfigMap(
  nodes: readonly GraphNode[],
  entities: readonly {
    readonly '@type': string
    readonly '@id'?: string | undefined
    readonly role?: string | undefined
  }[],
): ReadonlyMap<string, number> {
  const map = new Map<string, number>()
  const usedIndices = new Set<number>()

  for (const node of nodes) {
    const ek = node[EDIT_KEY]
    if (typeof ek !== 'string') continue

    const nodeType = typeString(node['@type'])
    const nodeId = typeof node['@id'] === 'string' ? node['@id'] : undefined
    const nodeRole = typeof node['role'] === 'string' ? (node['role'] as string) : undefined

    let matchIdx = -1

    // Prefer @id match (strongest correlation)
    if (nodeId) {
      matchIdx = entities.findIndex((e, i) => !usedIndices.has(i) && e['@id'] === nodeId)
    }

    // Fall back to @type + role match
    if (matchIdx < 0 && nodeType) {
      matchIdx = entities.findIndex(
        (e, i) =>
          !usedIndices.has(i) && e['@type'] === nodeType && (e.role ?? undefined) === nodeRole,
      )
    }

    // Fall back to @type-only match
    if (matchIdx < 0 && nodeType) {
      matchIdx = entities.findIndex((e, i) => !usedIndices.has(i) && e['@type'] === nodeType)
    }

    if (matchIdx >= 0) {
      map.set(ek, matchIdx)
      usedIndices.add(matchIdx)
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// orderedProperties
// ---------------------------------------------------------------------------

/**
 * Stable-sort a property classification list into display order:
 * 1. Required missing (red — needs attention)
 * 2. Recommended missing (yellow — would improve rich results)
 * 3. Set (green — already provided)
 * 4. Optional (grey — informational)
 * 5. Unknown (catalog doesn't know this property)
 *
 * Within each rank, properties are sorted alphabetically for stability.
 */
export function orderedProperties(
  classifications: readonly PropertyClassification[],
): readonly PropertyClassification[] {
  const rank = (c: PropertyClassification): number => {
    if (c.importance === 'required' && c.state === 'missing') return 0
    if (c.importance === 'recommended' && c.state === 'missing') return 1
    if (c.state === 'set') return 2
    if (c.importance === 'optional') return 3
    return 4
  }
  return [...classifications].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return a.property.localeCompare(b.property)
  })
}
