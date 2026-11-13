/**
 * Import diff engine for JSON-LD structured data.
 *
 * Parses an external JSON-LD blob, diffs it against the current graph,
 * rewrites @id values to match the current document's conventions,
 * and produces a selectable change list that can be applied to the
 * edit buffer.
 *
 * No React, no DOM. Pure functions, fully testable.
 */

import { type EditBuffer, setProperty } from './edit-buffer.js'
import type { GraphModel, GraphNode } from './jsonld-graph.js'
import { parseGraph, typeString } from './jsonld-graph.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single property-level change in the diff. */
export interface PropertyChange {
  entityType: string
  entityRole: string | undefined
  property: string
  kind: 'added' | 'changed' | 'removed'
  oldValue: unknown
  newValue: unknown
  /** True if the property is not in the catalog for this entity type. */
  unknownProperty: boolean
}

/** An entity-level entry in the diff. */
export interface EntityDiff {
  type: string
  role: string | undefined
  /** True if this entity type is not part of the current archetype (disabled). */
  disabled: boolean
  disabledReason: string | undefined
  changes: PropertyChange[]
}

/** Full diff result from parsing an import. */
export interface ImportDiff {
  entities: EntityDiff[]
  /** Total number of property changes across all entities. */
  totalPropertyChanges: number
  /** Total number of entity-level additions. */
  totalEntityAdditions: number
  /** Whether the size gate should be shown. */
  requiresConfirmation: boolean
  /** Parse error, if any. */
  error: string | undefined
  /** The parsed imported graph model (set when parse succeeds). */
  importedModel: GraphModel | undefined
}

/** A selected change to apply. */
export interface SelectedChange {
  entityType: string
  entityRole: string | undefined
  /** @id of the target entity in the current graph (for @id-based key matching). */
  entityId: string | undefined
  property: string
  value: unknown
  kind: 'added' | 'changed'
}

// ---------------------------------------------------------------------------
// Parse and diff
// ---------------------------------------------------------------------------

/**
 * Parse a JSON-LD blob and diff it against the current graph.
 *
 * Returns an ImportDiff with per-entity grouped changes. Each change
 * can be individually selected by the user before applying.
 */
export function parseAndDiff(
  jsonText: string,
  currentModel: GraphModel,
  currentEntityTypes: ReadonlySet<string>,
  catalogPropertySets: ReadonlyMap<string, ReadonlySet<string>>,
): ImportDiff {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    return emptyDiff(err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON')
  }

  const importedModel = parseGraph(parsed)
  if (importedModel.nodes.length === 0) {
    return emptyDiff('No entities found in the imported JSON-LD.')
  }

  const entities: EntityDiff[] = []
  let totalEntityAdditions = 0

  // Match imported entities against current entities by (@type, role) tuple
  for (const importedNode of importedModel.nodes) {
    const type = typeString(importedNode['@type'])
    if (!type) continue

    const role = typeof importedNode.role === 'string' ? importedNode.role : undefined
    const currentNode = findMatchingNode(currentModel, type, role)
    const isNewEntity = !currentNode
    const disabled = !currentEntityTypes.has(type)
    const catalogProps = catalogPropertySets.get(type)

    const changes: PropertyChange[] = []

    // Compare properties
    for (const [key, newVal] of Object.entries(importedNode)) {
      if (key === '@type' || key === '@id' || key === '@context' || key === 'role') continue

      const oldVal = currentNode?.[key]
      const unknownProperty = catalogProps ? !catalogProps.has(key) : false

      if (currentNode && key in currentNode) {
        // Property exists in both — check if changed
        if (!deepEqual(oldVal, newVal)) {
          changes.push({
            entityType: type,
            entityRole: role,
            property: key,
            kind: 'changed',
            oldValue: oldVal,
            newValue: newVal,
            unknownProperty,
          })
        }
      } else {
        // Property only in import — added
        changes.push({
          entityType: type,
          entityRole: role,
          property: key,
          kind: 'added',
          oldValue: undefined,
          newValue: newVal,
          unknownProperty,
        })
      }
    }

    // Check for removed properties (in current but not in import)
    if (currentNode) {
      for (const [key, oldVal] of Object.entries(currentNode)) {
        if (key === '@type' || key === '@id' || key === '@context' || key === 'role') continue
        if (!(key in importedNode)) {
          changes.push({
            entityType: type,
            entityRole: role,
            property: key,
            kind: 'removed',
            oldValue: oldVal,
            newValue: undefined,
            unknownProperty: false,
          })
        }
      }
    }

    if (changes.length > 0 || isNewEntity) {
      entities.push({
        type,
        role,
        disabled,
        disabledReason: disabled ? `${type} is not part of this document's archetype` : undefined,
        changes,
      })
      if (isNewEntity) totalEntityAdditions += 1
    }
  }

  const totalPropertyChanges = entities.reduce((sum, e) => sum + e.changes.length, 0)

  return {
    entities,
    totalPropertyChanges,
    totalEntityAdditions,
    requiresConfirmation: totalPropertyChanges >= 10 || entities.length >= 3,
    error: undefined,
    importedModel,
  }
}

// ---------------------------------------------------------------------------
// @id rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrite @id values in a property value to match the current document's
 * id conventions. Walks the value recursively.
 */
export function rewriteIds(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => rewriteIds(item, idMap))
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '@id' && typeof v === 'string') {
        result[k] = idMap.get(v) ?? v
      } else {
        result[k] = rewriteIds(v, idMap)
      }
    }
    return result
  }
  return value
}

/**
 * Build an @id rewrite map from imported IDs to current document conventions.
 * For each imported entity with an @id, maps it to the corresponding
 * current entity's @id (if it exists) or generates a conventional one.
 */
export function buildIdMap(
  importedModel: GraphModel,
  currentModel: GraphModel,
  baseUrl: string,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>()

  for (const importedNode of importedModel.nodes) {
    const importedId = importedNode['@id']
    if (typeof importedId !== 'string') continue

    const type = typeString(importedNode['@type'])
    if (!type) continue

    const role = typeof importedNode.role === 'string' ? importedNode.role : undefined
    const currentNode = findMatchingNode(currentModel, type, role)

    if (currentNode && typeof currentNode['@id'] === 'string') {
      map.set(importedId, currentNode['@id'])
    } else {
      // A conventional site-level @id, as `documentId` in @krantho/seo builds one: one slash
      map.set(importedId, `${baseUrl.replace(/\/+$/, '')}/#${type.toLowerCase()}`)
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Apply to edit buffer
// ---------------------------------------------------------------------------

/**
 * Apply selected changes to the edit buffer.
 * Returns the new buffer with all selected changes applied.
 */
export function applySelectedChanges(
  buffer: EditBuffer,
  selectedChanges: readonly SelectedChange[],
  idMap: ReadonlyMap<string, string>,
): EditBuffer {
  let result = buffer
  for (const change of selectedChanges) {
    const entityKey = selectedChangeKey(change)
    const rewrittenValue = rewriteIds(change.value, idMap)
    result = setProperty(result, entityKey, change.property, rewrittenValue)
  }
  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive entity key from a SelectedChange (mirrors entityKey from edit-buffer). */
function selectedChangeKey(change: SelectedChange): string {
  if (change.entityId) return change.entityId
  return change.entityRole ? `${change.entityType}:${change.entityRole}` : change.entityType
}

function findMatchingNode(
  model: GraphModel,
  type: string,
  role: string | undefined,
): GraphNode | undefined {
  return model.nodes.find((n) => {
    const nodeType = typeString(n['@type'])
    if (nodeType !== type) return false
    if (role) return n.role === role
    return true
  })
}

function emptyDiff(error: string): ImportDiff {
  return {
    entities: [],
    totalPropertyChanges: 0,
    totalEntityAdditions: 0,
    requiresConfirmation: false,
    error,
    importedModel: undefined,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]))
}
