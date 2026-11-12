import { getVocabularyProperty, isDatatype, isEnumeration } from '../vocabulary/index.js'

/**
 * The type a node given without one takes, for properties whose range offers
 * more than one class — the type search engines document for the property.
 */
const PREFERRED_VALUE_TYPES: Readonly<Record<string, string>> = {
  offers: 'Offer',
  author: 'Person',
  creator: 'Person',
  publisher: 'Organization',
  provider: 'Organization',
  organizer: 'Organization',
  location: 'Place',
  brand: 'Brand',
  review: 'Review',
}

/** The single class the property's range admits, or its documented preference */
function valueType(property: string): string | undefined {
  const preferred = PREFERRED_VALUE_TYPES[property]
  if (preferred) return preferred
  const classes = (getVocabularyProperty(property)?.range ?? []).filter(
    (type) => !isDatatype(type) && !isEnumeration(type),
  )
  return classes.length === 1 ? classes[0] : undefined
}

function typeNode(property: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  if ('@type' in value || '@id' in value || '@value' in value) return value
  const type = valueType(property)
  return type ? { '@type': type, ...value } : value
}

/**
 * A content or configuration value with a `@type` on every node given without
 * one — `offers: { price: '10' }` becomes an Offer — so a nested node is never
 * untyped when its property says what it is.
 */
export function typedValue(property: string, value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((item) => typeNode(property, item))
    : typeNode(property, value)
}
