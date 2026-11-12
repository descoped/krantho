import { buildSeoFieldMap, SEO_FIELD_CANDIDATES, type SeoFieldConcept } from '@krantho/seo-shared'
import type { JsonSchemaProperty } from '../lib/api-types.js'

/**
 * What Structure mode knows about a field from the collection's schema: which
 * input edits it, the type pill it shows, and which SEO outputs read it.
 */

/** The input a field is edited with */
export type FieldKind =
  | 'media'
  | 'reference'
  | 'enum'
  | 'boolean'
  | 'number'
  | 'tags'
  | 'textarea'
  | 'color'
  | 'date'
  | 'text'

/** The fields the API owns: `status` changes only through publishing, never in the form */
export const SYSTEM_FIELDS: ReadonlySet<string> = new Set(['status'])

/** A reference field's target collection, from its `ref:<collection>` description */
export function referenceTarget(property: JsonSchemaProperty): string | null {
  return property.description?.match(/^ref:(\w+)/)?.[1] ?? null
}

function stringKind(property: JsonSchemaProperty, name: string): FieldKind {
  if (property.format === 'date' || property.format === 'date-time') return 'date'
  if (name.includes('color') || name.includes('colour')) return 'color'
  if (property.maxLength !== undefined && property.maxLength > 200) return 'textarea'
  if (name.includes('description') || name.includes('ingress') || name.includes('intro'))
    return 'textarea'
  return 'text'
}

/** The input a field is edited with, from its schema and the naming conventions */
export function fieldKind(property: JsonSchemaProperty, name: string): FieldKind {
  if (property.description === 'media') return 'media'
  if (referenceTarget(property)) return 'reference'
  if (property.enum) return 'enum'
  if (property.type === 'boolean') return 'boolean'
  if (property.type === 'number' || property.type === 'integer') return 'number'
  if (property.type === 'array' && property.items?.type === 'string') return 'tags'
  if (property.type === 'string') return stringKind(property, name)
  return 'text'
}

/** The HTML input type of a one-line text or date field */
export function inputType(property: JsonSchemaProperty, name: string): string {
  if (property.type !== 'string') return 'text'
  if (property.format === 'uri' || property.format === 'url') return 'url'
  if (property.format === 'email') return 'email'
  if (property.format === 'date') return 'date'
  if (property.format === 'date-time') return 'datetime-local'
  if (name.includes('url') || name.includes('link') || name.includes('href')) return 'url'
  if (name.includes('email') || name.includes('e-mail')) return 'email'
  return 'text'
}

function stringPill(property: JsonSchemaProperty, name: string): string {
  if (property.format === 'date-time') return 'date and time'
  if (property.format === 'date') return 'date'
  if (property.format === 'uri' || property.format === 'url') return 'web address'
  if (property.format === 'email') return 'email'
  if (name.endsWith('-slug') || name === 'slug') return 'URL name'
  return 'text'
}

/** What kind of value a field takes, in an editor's words */
const KIND_PILLS: Readonly<Record<string, string>> = {
  media: 'image or file',
  reference: 'link to a page',
  enum: 'choice',
  color: 'color',
}

/** The type pill beside a field's label: text, number, yes/no, image or file, link to a page, … */
export function typePill(property: JsonSchemaProperty, name: string): string {
  const kind = fieldKind(property, name)
  const named = KIND_PILLS[kind]
  if (named) return named
  if (property.type === 'array') return property.items?.type === 'string' ? 'list of text' : 'list'
  if (property.type === 'string') return stringPill(property, name)
  if (property.type === 'integer') return 'number'
  if (property.type === 'boolean') return 'yes/no'
  if (property.type === 'object') return 'group'
  return property.type ?? 'text'
}

/** Help text under a field: the schema's description, unless it is a media or reference marker */
export function fieldHelp(property: JsonSchemaProperty): string | null {
  if (property.description === 'media' || referenceTarget(property) !== null) return null
  return property.description?.trim() || null
}

/** How an SEO concept from `@krantho/seo-shared` reads on a field's chip */
const SEO_OUTPUT_LABELS: Readonly<Record<SeoFieldConcept, string>> = {
  title: 'title',
  description: 'meta description',
  author: 'author',
  datePublished: 'date published',
  image: 'image',
  canonicalUrl: 'canonical address',
  robotsIndex: 'search indexing',
  robotsFollow: 'link following',
  ogTitle: 'sharing title',
  ogDescription: 'sharing description',
  ogImage: 'sharing image',
  ogType: 'sharing type',
}

const CONCEPTS = Object.keys(SEO_FIELD_CANDIDATES) as SeoFieldConcept[]

function addUnique(map: Map<string, string[]>, key: string, label: string): void {
  const labels = map.get(key) ?? []
  if (!labels.includes(label)) labels.push(label)
  map.set(key, labels)
}

/**
 * Which SEO outputs read each field, from `@krantho/seo-shared`'s field
 * discovery: the field it picks for a concept reads as that concept's output;
 * a field that is a later candidate for a concept reads as its fallback (used
 * when the picked field is absent). A field seo-shared does not know gets no
 * entry.
 */
export function seoFieldUses(fieldNames: readonly string[]): Map<string, string> {
  const present = new Set(fieldNames)
  const picked = buildSeoFieldMap(fieldNames)
  const outputs = new Map<string, string[]>()
  const fallbacks = new Map<string, string[]>()
  for (const concept of CONCEPTS) {
    for (const candidate of SEO_FIELD_CANDIDATES[concept]) {
      if (!present.has(candidate)) continue
      const target = picked[concept] === candidate ? outputs : fallbacks
      addUnique(target, candidate, SEO_OUTPUT_LABELS[concept])
    }
  }
  const uses = new Map<string, string>()
  for (const name of fieldNames) {
    const own = outputs.get(name)
    const backup = fallbacks.get(name)?.filter((label) => !own?.includes(label))
    const parts = [...(own ?? []), ...(backup?.length ? [`backup for ${backup.join(', ')}`] : [])]
    if (parts.length > 0) uses.set(name, parts.join(' · '))
  }
  return uses
}
