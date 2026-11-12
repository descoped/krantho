import {
  type ContentDocument,
  canGetContent,
  canQuery,
  hasRuntimeSchema,
  type IPersistenceAdapter,
  type RuntimeFieldDefinition,
} from '@krantho/persistence'
import type { ContentConfig } from '@krantho/schema'

interface RefField {
  name: string
  refCollection: string
  isArray: boolean
}

/** Extract reference fields from runtime schema for a collection */
async function getReferenceFields(
  collection: string,
  adapter: IPersistenceAdapter,
): Promise<RefField[]> {
  if (!hasRuntimeSchema(adapter)) return []

  const schema = await adapter.getRuntimeSchema(collection)
  if (!schema) return []

  return schema.fields
    .filter((f: RuntimeFieldDefinition) => f.type === 'reference' && f.refCollection)
    .map((f: RuntimeFieldDefinition) => ({
      name: f.name,
      // Safe: the filter above guarantees f.refCollection is defined
      refCollection: f.refCollection!,
      isArray: f.isArray ?? false,
    }))
}

/**
 * Resolve reference fields in a ContentDocument.
 *
 * Collects all reference field slugs, batch-loads them per collection,
 * and replaces slug strings with full ContentDocument objects.
 */
export async function resolveReferences(
  doc: ContentDocument,
  adapter: IPersistenceAdapter,
): Promise<ContentDocument> {
  const refFields = await getReferenceFields(doc.meta.collection, adapter)
  if (refFields.length === 0) return doc

  // Collect slugs to resolve, grouped by target collection
  const toResolve = new Map<string, Set<string>>()

  for (const field of refFields) {
    const value = doc.fields[field.name]
    if (!value || !field.refCollection) continue

    if (!toResolve.has(field.refCollection)) {
      toResolve.set(field.refCollection, new Set())
    }
    const slugs = toResolve.get(field.refCollection)!

    if (field.isArray && Array.isArray(value)) {
      for (const slug of value) {
        if (typeof slug === 'string') slugs.add(slug)
      }
    } else if (typeof value === 'string') {
      slugs.add(value)
    }
  }

  if (toResolve.size === 0) return doc

  // Batch load per collection
  const resolved = new Map<string, ContentDocument>()

  for (const [collection, slugs] of toResolve) {
    if (!canGetContent(adapter)) continue
    for (const slug of slugs) {
      const refDoc = await adapter.getContent(collection, slug)
      if (refDoc) resolved.set(`${collection}/${slug}`, refDoc)
    }
  }

  if (resolved.size === 0) return doc

  // Replace slug values with resolved documents
  const resolvedFields = { ...doc.fields }

  for (const field of refFields) {
    const value = doc.fields[field.name]
    if (!value || !field.refCollection) continue

    if (field.isArray && Array.isArray(value)) {
      resolvedFields[field.name] = value.map((slug) => {
        if (typeof slug !== 'string') return slug
        return resolved.get(`${field.refCollection}/${slug}`) ?? slug
      })
    } else if (typeof value === 'string') {
      const refDoc = resolved.get(`${field.refCollection}/${value}`)
      if (refDoc) resolvedFields[field.name] = refDoc
    }
  }

  return { ...doc, fields: resolvedFields }
}

/**
 * Find all content items that reference a specific slug in a specific collection.
 *
 * Scans all collections for reference fields pointing to the target collection,
 * then checks each item's field values.
 */
export async function findReferencingItems(
  targetCollection: string,
  targetSlug: string,
  adapter: IPersistenceAdapter,
  contentConfig: ContentConfig,
): Promise<Array<{ collection: string; slug: string; field: string }>> {
  const references: Array<{ collection: string; slug: string; field: string }> = []

  for (const [, collectionDef] of contentConfig.collections) {
    const refFields = await getReferenceFields(collectionDef.name, adapter)
    const matching = refFields.filter((f) => f.refCollection === targetCollection)
    if (matching.length === 0) continue

    if (!canQuery(adapter)) continue
    const { items } = await adapter.query({
      state: 'current',
      projection: 'summary',
      collections: [collectionDef.name],
    })

    for (const item of items) {
      for (const field of matching) {
        const value = item.fields[field.name]

        if (field.isArray && Array.isArray(value)) {
          if (value.includes(targetSlug)) {
            references.push({
              collection: collectionDef.name,
              slug: item.meta.slug,
              field: field.name,
            })
          }
        } else if (value === targetSlug) {
          references.push({
            collection: collectionDef.name,
            slug: item.meta.slug,
            field: field.name,
          })
        }
      }
    }
  }

  return references
}
