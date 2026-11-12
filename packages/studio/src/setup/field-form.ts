import type { RuntimeFieldDefinition } from '../lib/api.js'

/** The runtime field types the API accepts (`PUT /api/schema/:collection/fields`) */
export const FIELD_TYPES: readonly RuntimeFieldDefinition['type'][] = [
  'string',
  'textarea',
  'number',
  'boolean',
  'date',
  'enum',
  'url',
  'email',
  'color',
  'reference',
]

/** What a field type is called on screen: the name an editor would use */
const FIELD_TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'text (one line)',
  textarea: 'text (long)',
  number: 'number',
  boolean: 'yes/no',
  date: 'date',
  enum: 'choice',
  url: 'web address',
  email: 'email',
  color: 'color',
  reference: 'link to a page',
  // Types a code-defined field has
  integer: 'number',
  array: 'list',
  object: 'group',
}

/** A field type as it reads on screen; a type with no plain name reads as it is */
export function fieldTypeName(type: string): string {
  return FIELD_TYPE_NAMES[type] ?? type
}

/** A runtime field as its form holds it: every value as typed */
export interface FieldForm {
  name: string
  type: RuntimeFieldDefinition['type']
  required: boolean
  description: string
  defaultValue: string
  /** Comma-separated, for an enum */
  enumValues: string
  /** The collection a reference points into */
  refCollection: string
  min: string
  max: string
  pattern: string
}

const text = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

/** The form for a field being edited, or an empty one for a new field */
export function formOf(field: RuntimeFieldDefinition | null): FieldForm {
  return {
    name: field?.name ?? '',
    type: field?.type ?? 'string',
    required: field?.required ?? false,
    description: field?.description ?? '',
    defaultValue: text(field?.default),
    enumValues: field?.enumValues?.join(', ') ?? '',
    refCollection: field?.refCollection ?? '',
    min: text(field?.min),
    max: text(field?.max),
    pattern: field?.pattern ?? '',
  }
}

/** Whether a type takes a length or a range */
export function hasBounds(type: RuntimeFieldDefinition['type']): boolean {
  return type === 'string' || type === 'textarea' || type === 'number'
}

function defaultOf(form: FieldForm): unknown {
  const value = form.defaultValue.trim()
  if (!value) return undefined
  if (form.type === 'number') return Number(value)
  if (form.type === 'boolean') return value === 'true'
  return value
}

function enumValuesOf(form: FieldForm): string[] {
  return form.enumValues
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

/** Why the default does not fit the type, or null */
function defaultError(form: FieldForm): string | null {
  const value = form.defaultValue.trim()
  if (!value) return null
  if (form.type === 'number' && !Number.isFinite(Number(value))) return 'The default is a number.'
  if (form.type === 'boolean' && value !== 'true' && value !== 'false') {
    return 'The default is true or false.'
  }
  if (form.type === 'enum' && !enumValuesOf(form).includes(value)) {
    return 'The default is one of the values.'
  }
  return null
}

/** Why the length or range does not hold, or null */
function boundsError(form: FieldForm): string | null {
  if (!hasBounds(form.type)) return null
  const [min, max] = [form.min.trim(), form.max.trim()]
  if ([min, max].some((bound) => bound && !Number.isFinite(Number(bound)))) {
    return 'Minimum and maximum are numbers.'
  }
  if (min && max && Number(min) > Number(max)) return 'The minimum is not above the maximum.'
  return null
}

/** Why the pattern is not a regular expression, or null */
function patternError(form: FieldForm): string | null {
  const pattern = form.pattern.trim()
  if (form.type !== 'string' || !pattern) return null
  try {
    new RegExp(pattern)
    return null
  } catch {
    return 'The pattern is not a valid regular expression.'
  }
}

/** Why the form cannot be saved, or null when it can */
export function fieldFormError(form: FieldForm): string | null {
  const name = form.name.trim()
  if (!name) return 'A field needs a name.'
  if (!/^[a-z][a-z0-9_-]*$/i.test(name)) {
    return 'A name starts with a letter and holds only letters, digits, hyphens and underscores.'
  }
  if (form.type === 'reference' && !form.refCollection) return 'Choose the collection it refers to.'
  // The schema makes an enum of two different values or more; with fewer the field takes any text
  if (form.type === 'enum' && new Set(enumValuesOf(form)).size < 2)
    return 'Give the enum two different values or more.'
  return boundsError(form) ?? patternError(form) ?? defaultError(form)
}

/** The definition the form describes; only what applies to its type is sent */
export function fieldOf(form: FieldForm): RuntimeFieldDefinition {
  const enumValues = enumValuesOf(form)
  const field: RuntimeFieldDefinition = {
    name: form.name.trim(),
    type: form.type,
    required: form.required,
  }
  const fallback = defaultOf(form)
  if (fallback !== undefined) field.default = fallback
  if (form.description.trim()) field.description = form.description.trim()
  if (form.type === 'enum' && enumValues.length > 0) field.enumValues = enumValues
  if (form.type === 'reference') field.refCollection = form.refCollection
  if (hasBounds(form.type) && form.min.trim()) field.min = Number(form.min)
  if (hasBounds(form.type) && form.max.trim()) field.max = Number(form.max)
  if (form.type === 'string' && form.pattern.trim()) field.pattern = form.pattern.trim()
  return field
}
