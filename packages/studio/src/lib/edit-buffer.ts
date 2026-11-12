/**
 * Pure data layer for the graph browser edit buffer.
 *
 * Accumulates changes (property edits, entity additions/deletions) without
 * touching the database. Saves are explicit via `bufferToConfigUpdate()`.
 * Every function is immutable — returns a new buffer, never mutates.
 *
 * No React, no DOM. Fully testable in isolation.
 */

import type { SeoConfigData, SeoConfigEntity } from './api-types.js'
import {
  buildByEkIndex,
  buildReferencedByIndex,
  EDIT_KEY,
  type GraphModel,
  type GraphNode,
} from './jsonld-graph.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Immutable edit buffer — accumulates changes to the entity graph. */
export interface EditBuffer {
  /** Per-entity property overrides, keyed by entity key (@id or internal key). */
  readonly overrides: ReadonlyMap<string, Record<string, unknown>>
  /** Per-entity removed properties. */
  readonly removed: ReadonlyMap<string, ReadonlySet<string>>
  /** Entities added by the user (not in the original graph). */
  readonly added: ReadonlyMap<string, SeoConfigEntity>
  /** Entity keys the user has deleted. */
  readonly deleted: ReadonlySet<string>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a fresh empty buffer. */
export function createBuffer(): EditBuffer {
  return {
    overrides: new Map(),
    removed: new Map(),
    added: new Map(),
    deleted: new Set(),
  }
}

// ---------------------------------------------------------------------------
// Dirty check
// ---------------------------------------------------------------------------

/** True when the buffer has any pending changes. */
export function isDirty(buffer: EditBuffer): boolean {
  return (
    buffer.overrides.size > 0 ||
    buffer.removed.size > 0 ||
    buffer.added.size > 0 ||
    buffer.deleted.size > 0
  )
}

// ---------------------------------------------------------------------------
// Operations — each returns a new buffer
// ---------------------------------------------------------------------------

/** Set a property value on an entity. */
export function setProperty(
  buffer: EditBuffer,
  entityKey: string,
  property: string,
  value: unknown,
): EditBuffer {
  const existing = buffer.overrides.get(entityKey) ?? {}
  const next = new Map(buffer.overrides)
  next.set(entityKey, { ...existing, [property]: value })

  // If previously removed, un-remove it
  const removedSet = buffer.removed.get(entityKey)
  if (removedSet?.has(property)) {
    const nextRemoved = new Map(buffer.removed)
    const updated = new Set(removedSet)
    updated.delete(property)
    if (updated.size === 0) {
      nextRemoved.delete(entityKey)
    } else {
      nextRemoved.set(entityKey, updated)
    }
    return { ...buffer, overrides: next, removed: nextRemoved }
  }

  return { ...buffer, overrides: next }
}

/** Set a nested property inside a sub-entity (e.g. address.streetAddress). */
export function setNestedProperty(
  buffer: EditBuffer,
  entityKey: string,
  path: readonly string[],
  value: unknown,
  currentProperties: Record<string, unknown>,
): EditBuffer {
  if (path.length === 0) return buffer
  if (path.length === 1) {
    return setProperty(buffer, entityKey, path[0]!, value)
  }

  // Build the nested object by walking the path
  const topKey = path[0]!
  const existingOverride = buffer.overrides.get(entityKey)?.[topKey]
  const existingValue =
    existingOverride !== undefined ? existingOverride : currentProperties[topKey]

  // Deep-clone the top-level value so we can set the nested path
  const topValue =
    existingValue !== null && typeof existingValue === 'object'
      ? { ...(existingValue as Record<string, unknown>) }
      : {}

  // Walk to the parent of the target, creating objects along the way
  let cursor = topValue as Record<string, unknown>
  for (let i = 1; i < path.length - 1; i++) {
    const segment = path[i]!
    const next = cursor[segment]
    if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
      cursor[segment] = { ...(next as Record<string, unknown>) }
      cursor = cursor[segment] as Record<string, unknown>
    } else {
      const obj: Record<string, unknown> = {}
      cursor[segment] = obj
      cursor = obj
    }
  }
  cursor[path[path.length - 1]!] = value

  return setProperty(buffer, entityKey, topKey, topValue)
}

/** Remove a property from an entity. */
export function removeProperty(
  buffer: EditBuffer,
  entityKey: string,
  property: string,
): EditBuffer {
  const removedSet = buffer.removed.get(entityKey)
  const nextRemoved = new Map(buffer.removed)
  nextRemoved.set(entityKey, new Set([...(removedSet ?? []), property]))

  // Also remove from overrides if present
  const overrides = buffer.overrides.get(entityKey)
  if (overrides && property in overrides) {
    const next = new Map(buffer.overrides)
    const { [property]: _, ...rest } = overrides
    if (Object.keys(rest).length === 0) {
      next.delete(entityKey)
    } else {
      next.set(entityKey, rest)
    }
    return { ...buffer, overrides: next, removed: nextRemoved }
  }

  return { ...buffer, removed: nextRemoved }
}

/** Add a new entity to the graph. */
export function addEntity(buffer: EditBuffer, entity: SeoConfigEntity): EditBuffer {
  const key = entityKey(entity)
  const next = new Map(buffer.added)
  next.set(key, entity)

  // If previously deleted, un-delete
  if (buffer.deleted.has(key)) {
    const nextDeleted = new Set(buffer.deleted)
    nextDeleted.delete(key)
    return { ...buffer, added: next, deleted: nextDeleted }
  }

  return { ...buffer, added: next }
}

/** Delete an entity from the graph. */
export function deleteEntity(buffer: EditBuffer, key: string): EditBuffer {
  // If it was an added entity, just remove it from `added`
  if (buffer.added.has(key)) {
    const nextAdded = new Map(buffer.added)
    nextAdded.delete(key)
    return { ...buffer, added: nextAdded }
  }

  const nextDeleted = new Set(buffer.deleted)
  nextDeleted.add(key)

  // Clean up any overrides/removed for this entity
  const nextOverrides = new Map(buffer.overrides)
  nextOverrides.delete(key)
  const nextRemoved = new Map(buffer.removed)
  nextRemoved.delete(key)

  return { ...buffer, overrides: nextOverrides, removed: nextRemoved, deleted: nextDeleted }
}

/** Change an entity's @type. Preserves role and properties. */
export function changeEntityType(buffer: EditBuffer, key: string, newType: string): EditBuffer {
  // For added entities, update in place
  if (buffer.added.has(key)) {
    const entity = buffer.added.get(key)!
    const nextAdded = new Map(buffer.added)
    nextAdded.set(key, { ...entity, '@type': newType })
    return { ...buffer, added: nextAdded }
  }

  // For existing entities, record the type change as a special override
  return setProperty(buffer, key, '@type', newType)
}

// ---------------------------------------------------------------------------
// Apply buffer to GraphModel — produces a preview model with edits visible
// ---------------------------------------------------------------------------

/**
 * Apply the edit buffer to a GraphModel, producing a new model with all
 * edits visible. Used for live preview — the preview model is derived,
 * never persisted directly.
 */
export function applyBuffer(model: GraphModel, buffer: EditBuffer): GraphModel {
  if (!isDirty(buffer)) return model

  const nodes: GraphNode[] = []

  for (const node of model.nodes) {
    const key = nodeKey(node)
    if (buffer.deleted.has(key)) continue

    const overrides = buffer.overrides.get(key)
    const removedProps = buffer.removed.get(key)

    if (!overrides && !removedProps) {
      nodes.push(node)
      continue
    }

    // Build a new node with overrides applied and removed props stripped
    const entries: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (removedProps?.has(k)) continue
      entries[k] = v
    }
    if (overrides) {
      // Handle @type override specially
      const typeOverride = overrides['@type']
      if (typeof typeOverride === 'string') {
        entries['@type'] = typeOverride
      }
      for (const [k, v] of Object.entries(overrides)) {
        if (k === '@type') continue
        entries[k] = v
      }
    }
    nodes.push(entries as GraphNode)
  }

  // Append added entities — assign _ek to new nodes
  let addedIdx = 0
  for (const entity of buffer.added.values()) {
    const node: Record<string, unknown> = {
      '@type': entity['@type'],
      ...entity.properties,
      [EDIT_KEY]: `added:${addedIdx++}`,
    }
    if (entity['@id']) node['@id'] = entity['@id']
    nodes.push(node as GraphNode)
  }

  // Rebuild all indexes
  const byEk = buildByEkIndex(nodes)
  const byId = new Map<string, GraphNode>()
  for (const node of nodes) {
    const id = node['@id']
    if (typeof id === 'string') byId.set(id, node)
  }
  const referencedBy = buildReferencedByIndex(nodes)

  return {
    nodes,
    byEk,
    byId,
    referencedBy,
    primary: model.primary ? (byId.get(model.primary['@id'] ?? '') ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// Buffer → API payload
// ---------------------------------------------------------------------------

/**
 * Produce the SeoConfigData update payload from the current buffer and
 * the existing config.
 *
 * `ekToConfigIndex` maps edit keys (`_ek` values) to config entity indices.
 * This bridges the edit buffer (keyed by `_ek`) to the config persistence
 * (keyed by entity position). Built by `buildEkConfigMap()` at load time.
 *
 * The `@id` property on config entities is never touched — it's a semantic
 * JSON-LD value, not edit infrastructure.
 */
export function bufferToConfigUpdate(
  buffer: EditBuffer,
  existing: SeoConfigData,
  ekToConfigIndex: ReadonlyMap<string, number>,
): SeoConfigData {
  // Build reverse map: config entity index → edit key
  const configIndexToEk = new Map<number, string>()
  for (const [ek, idx] of ekToConfigIndex) {
    configIndexToEk.set(idx, ek)
  }

  const entities: SeoConfigEntity[] = []

  for (let i = 0; i < existing.entities.length; i++) {
    const entity = existing.entities[i]!
    const ek = configIndexToEk.get(i)

    // Check if this entity was deleted
    if (ek && buffer.deleted.has(ek)) continue

    const overrides = ek ? buffer.overrides.get(ek) : undefined
    const removedProps = ek ? buffer.removed.get(ek) : undefined

    if (!overrides && !removedProps) {
      entities.push({
        ...entity,
        properties: stripNestedIds(entity.properties),
      })
      continue
    }

    // Build updated properties
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(entity.properties)) {
      if (removedProps?.has(k)) continue
      props[k] = v
    }
    if (overrides) {
      for (const [k, v] of Object.entries(overrides)) {
        if (k === '@type') continue
        props[k] = v
      }
    }

    const typeOverride = overrides?.['@type']
    entities.push({
      '@type': typeof typeOverride === 'string' ? typeOverride : entity['@type'],
      ...(entity['@id'] ? { '@id': entity['@id'] } : {}),
      ...(entity.role ? { role: entity.role } : {}),
      properties: stripNestedIds(props),
    })
  }

  // Append added entities
  for (const entity of buffer.added.values()) {
    entities.push({
      ...entity,
      properties: stripNestedIds(entity.properties),
    })
  }

  // Everything beside the entities — field mappings, page structure, the
  // site's robots.txt — is kept as it was
  return { ...existing, entities }
}

// ---------------------------------------------------------------------------
// Property sanitization
// ---------------------------------------------------------------------------

/**
 * Recursively strip `@id` from nested objects within entity properties.
 *
 * Config entity properties are inline data values (PostalAddress,
 * OpeningHoursSpecification, etc.) — not linked entities. They should
 * never carry `@id`. Any `@id` on a nested property object is a leak
 * from the edit layer and must be removed before persistence.
 *
 * The entity's own `@id` (on the SeoConfigEntity) is NOT affected —
 * this only sanitizes the `properties` record.
 */
function stripNestedIds(props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    result[key] = stripIdFromValue(value)
  }
  return result
}

function stripIdFromValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(stripIdFromValue)
  }

  const obj = value as Record<string, unknown>
  if ('@type' in obj) {
    // Nested Schema.org entity — strip @id, recurse into properties
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '@id') continue
      cleaned[k] = stripIdFromValue(v)
    }
    return cleaned
  }

  return value
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable key for a config entity.
 * Prefers @id (the JSON-LD identity), falls back to @type:role or @type.
 */
export function entityKey(entity: SeoConfigEntity): string {
  if (entity['@id']) return entity['@id']
  return entity.role ? `${entity['@type']}:${entity.role}` : entity['@type']
}

/**
 * Return the edit key (`_ek`) for a graph node. Every node parsed by
 * `parseGraph()` has one. Falls back to `@type` as a defensive measure
 * but this should never be hit in practice.
 */
export function nodeKey(node: GraphNode): string {
  const ek = node[EDIT_KEY]
  if (typeof ek === 'string') return ek
  // Defensive fallback — should not be reached after parseGraph
  const type =
    typeof node['@type'] === 'string'
      ? node['@type']
      : Array.isArray(node['@type'])
        ? node['@type'][0]
        : null
  return typeof type === 'string' ? type : 'unknown'
}
