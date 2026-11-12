import type { SchemaEntity } from '../graph/types.js'

/** Whether a value carries nothing: undefined, null, an empty string or an empty array */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.length === 0
  return Array.isArray(value) && value.length === 0
}

/** A string value, or '' when the value is not a string */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * A list of strings: an array's string entries, a comma-separated string
 * split, or a single string. Empty entries are dropped.
 */
export function asStringList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : []
  return items.map((s) => s.trim()).filter((s) => s.length > 0)
}

/** The entity without empty properties, so JSON-LD output stays clean */
export function compact(entity: SchemaEntity): SchemaEntity {
  const result: SchemaEntity = { '@type': entity['@type'] }
  for (const [key, value] of Object.entries(entity)) {
    if (!isEmpty(value)) result[key] = value
  }
  return result
}

/**
 * A sub-entity from a value that is either an object (its properties, typed)
 * or a string (wrapped as `{ '@type': type, [stringKey]: value }`); undefined
 * when there is nothing to wrap.
 */
export function asSubEntity(
  value: unknown,
  type: string,
  stringKey: string,
): SchemaEntity | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return compact({ '@type': type, ...(value as Record<string, unknown>) })
  }
  if (typeof value === 'string' && value.length > 0) {
    return compact({ '@type': type, [stringKey]: value })
  }
  return undefined
}

/** A reference to the node with that `@id` */
export function ref(id: string): { '@id': string } {
  return { '@id': id }
}
