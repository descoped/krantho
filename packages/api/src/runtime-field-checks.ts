import type { RuntimeFieldDefinition } from '@krantho/persistence'

/** A runtime field's name: a letter, then letters, digits, hyphens and underscores */
const FIELD_NAME = /^[a-z][a-z0-9_-]*$/i

/** Why the default does not fit the field's type, or null */
function defaultError(field: RuntimeFieldDefinition): string | null {
  const value = field.default
  if (value === undefined) return null
  if (field.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : 'The default is a number.'
  }
  if (field.type === 'boolean') {
    return typeof value === 'boolean' ? null : 'The default is true or false.'
  }
  if (typeof value !== 'string') return 'The default is text.'
  if (field.type === 'enum' && !field.enumValues?.includes(value)) {
    return 'The default is one of the values.'
  }
  return null
}

/** Whether a value sent as an enum's values is a list of text */
export function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Why the enum's values do not hold, or null: the schema makes an enum of two
 * different values or more, and with fewer the field would take any text
 */
function enumError({ type, enumValues }: RuntimeFieldDefinition): string | null {
  if (type !== 'enum') return null
  return new Set(enumValues).size < 2 ? 'An enum has two different values or more.' : null
}

/** Why the bounds do not hold, or null */
function boundsError({ min, max }: RuntimeFieldDefinition): string | null {
  if ([min, max].some((bound) => bound !== undefined && !Number.isFinite(bound))) {
    return 'Minimum and maximum are numbers.'
  }
  if (min !== undefined && max !== undefined && min > max) {
    return 'The minimum is not above the maximum.'
  }
  return null
}

/** Why the pattern is not a regular expression, or null */
function patternError({ pattern }: RuntimeFieldDefinition): string | null {
  if (pattern === undefined) return null
  try {
    new RegExp(pattern)
    return null
  } catch {
    return 'The pattern is not a valid regular expression.'
  }
}

/**
 * Why a runtime field definition cannot be saved, or null when it can. The
 * merged schema is built from these definitions, so one that does not hold —
 * a pattern that does not compile, an enum the schema would turn into plain
 * text — would break every save in its collection.
 */
export function runtimeFieldError(
  field: RuntimeFieldDefinition,
  collections: ReadonlySet<string>,
): string | null {
  if (!FIELD_NAME.test(field.name)) {
    return 'A name starts with a letter and holds only letters, digits, hyphens and underscores.'
  }
  if (
    field.type === 'reference' &&
    !(field.refCollection && collections.has(field.refCollection))
  ) {
    return 'A reference field names the collection it refers to.'
  }
  return enumError(field) ?? boundsError(field) ?? patternError(field) ?? defaultError(field)
}
