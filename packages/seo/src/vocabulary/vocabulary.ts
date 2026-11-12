import { VOCABULARY } from './schemaorg.generated.js'
import type { Lifecycle, VocabularyProperty, VocabularyType } from './types.js'

const SCHEMA_PREFIXES = ['https://schema.org/', 'http://schema.org/', 'schema:'] as const

/** A term's name without a Schema.org prefix: `https://schema.org/InStock` → `InStock` */
export function termName(value: string): string {
  for (const prefix of SCHEMA_PREFIXES) {
    if (value.startsWith(prefix)) return value.slice(prefix.length)
  }
  return value
}

/** The Schema.org class of that name, if the pinned release has it */
export function getVocabularyType(type: string): VocabularyType | undefined {
  return Object.hasOwn(VOCABULARY.types, type) ? VOCABULARY.types[type] : undefined
}

/** The Schema.org property of that name, if the pinned release has it */
export function getVocabularyProperty(property: string): VocabularyProperty | undefined {
  return Object.hasOwn(VOCABULARY.properties, property)
    ? VOCABULARY.properties[property]
    : undefined
}

const ancestorCache = new Map<string, ReadonlySet<string>>()

/** The type and every class it inherits from; empty for a type the vocabulary does not have */
export function ancestorsOf(type: string): ReadonlySet<string> {
  const cached = ancestorCache.get(type)
  if (cached) return cached
  const ancestors = new Set<string>()
  const pending = getVocabularyType(type) ? [type] : []
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (ancestors.has(next)) continue
    ancestors.add(next)
    pending.push(...(getVocabularyType(next)?.parents ?? []))
  }
  ancestorCache.set(type, ancestors)
  return ancestors
}

/** Whether `type` is `ancestor` or inherits from it */
export function isSubtypeOf(type: string, ancestor: string): boolean {
  return ancestorsOf(type).has(ancestor)
}

/** Whether the type is a data type (Text, URL, Integer …) */
export function isDatatype(type: string): boolean {
  for (const ancestor of ancestorsOf(type)) {
    if (getVocabularyType(ancestor)?.datatype) return true
  }
  return false
}

/** Whether the type is an enumeration, whose values are its members */
export function isEnumeration(type: string): boolean {
  return isSubtypeOf(type, 'Enumeration')
}

/** The enumerations a member belongs to; empty when the name is not a member */
export function enumerationsOf(member: string): readonly string[] {
  const name = termName(member)
  return Object.hasOwn(VOCABULARY.members, name) ? (VOCABULARY.members[name]?.types ?? []) : []
}

/** Whether the property may be used on the type, directly or through a superclass */
export function isPropertyOfType(property: string, type: string): boolean {
  const domain = getVocabularyProperty(property)?.domain ?? []
  const ancestors = ancestorsOf(type)
  return domain.some((owner) => ancestors.has(owner))
}

/** Every property the type may carry, its own and inherited */
export function propertiesOf(type: string): readonly string[] {
  return Object.keys(VOCABULARY.properties).filter((property) => isPropertyOfType(property, type))
}

/** Whether a value of the type fits the property's range */
export function rangeAcceptsType(property: string, type: string): boolean {
  const range = getVocabularyProperty(property)?.range ?? []
  const ancestors = ancestorsOf(type)
  return range.some((accepted) => ancestors.has(accepted))
}

/** Where a type, property or enumeration member stands; undefined for a current term */
export function lifecycleOf(term: string): Lifecycle | undefined {
  const name = termName(term)
  return (
    getVocabularyType(name)?.lifecycle ??
    getVocabularyProperty(name)?.lifecycle ??
    (Object.hasOwn(VOCABULARY.members, name) ? VOCABULARY.members[name]?.lifecycle : undefined)
  )
}

/** Whether the name is a term of the pinned release — a type, property or enumeration member */
export function isVocabularyTerm(term: string): boolean {
  const name = termName(term)
  return (
    getVocabularyType(name) !== undefined ||
    getVocabularyProperty(name) !== undefined ||
    Object.hasOwn(VOCABULARY.members, name)
  )
}
