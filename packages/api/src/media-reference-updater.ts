import {
  type ContentDocument,
  ContentWriteConflict,
  type ContentWriter,
  canGetContent,
  canQuery,
  currentIsLive,
  type IPersistenceAdapter,
} from '@krantho/persistence'
import type { ContentConfig } from '@krantho/schema'

/** The outcome of a media reference update: documents rewritten, and the ones that could not be */
export interface MediaReferenceUpdate {
  readonly updated: number
  readonly failed: ReadonlyArray<{
    collection: string
    slug: string
    locale: string
    reason: string
  }>
}

/**
 * Scan all content for references to an old media URL and update them to the
 * new URL. Each updated document gets a new version (append-only).
 *
 * Scans `fields`, the authored `metadata` (a sharing image, say) and the
 * markdown `body`. Each write names the version it read and keeps the
 * document's contract and provenance; a document edited meanwhile is read
 * again and retried once. A document that still fails is reported, and the
 * rest are updated all the same.
 */
export async function updateMediaReferences(
  oldUrl: string,
  newUrl: string,
  adapter: IPersistenceAdapter,
  contentConfig: ContentConfig,
): Promise<MediaReferenceUpdate> {
  const collections = [...contentConfig.collections.keys()]
  if (collections.length === 0 || !canQuery(adapter) || !adapter.writeContent)
    return { updated: 0, failed: [] }
  const writer = adapter as IPersistenceAdapter & ContentWriter
  let updated = 0
  const failed: Array<MediaReferenceUpdate['failed'][number]> = []
  const { items } = await adapter.query({ state: 'current', projection: 'full', collections })
  for (const item of items) {
    try {
      if (await rewriteDocument(writer, item, oldUrl, newUrl)) updated++
    } catch (error) {
      const { collection, slug, locale } = item.meta
      const reason = error instanceof Error ? error.message : 'unknown error'
      failed.push({ collection, slug, locale, reason })
    }
  }
  return { updated, failed }
}

/** Write the document with the new URL; true when a version was written */
async function rewriteDocument(
  adapter: IPersistenceAdapter & ContentWriter,
  item: ContentDocument,
  oldUrl: string,
  newUrl: string,
): Promise<boolean> {
  let document = item
  for (let attempt = 1; ; attempt++) {
    const fields = replaceInFields(document.fields, oldUrl, newUrl)
    const metadata = replaceInFields(
      document.metadata,
      oldUrl,
      newUrl,
    ) as ContentDocument['metadata']
    const body = document.body.replaceAll(oldUrl, newUrl)
    if (fields === document.fields && metadata === document.metadata && body === document.body)
      return false
    try {
      // A live document in step with its page stays live with the new URL;
      // one with changes ahead gets the new URL in its current version only
      await adapter.writeContent(
        {
          collection: document.meta.collection,
          slug: document.meta.slug,
          locale: document.meta.locale,
          fields,
          body,
          metadata,
          contract: document.contract,
          defaults: document.defaults,
          repositoryBasis: document.repositoryBasis,
          publication: currentIsLive(document.meta) ? 'publish' : undefined,
          expectedVersion: document.meta.version,
        },
        'media-replace',
      )
      return true
    } catch (error) {
      if (!(error instanceof ContentWriteConflict) || !canGetContent(adapter) || attempt === 2)
        throw error
      const fresh = await adapter.getContent(
        document.meta.collection,
        document.meta.slug,
        document.meta.locale,
      )
      // Deleted meanwhile: nothing left that points at the old file
      if (!fresh) return false
      document = fresh
    }
  }
}

/**
 * Recursively replace all string occurrences of oldUrl with newUrl in a fields object.
 * Returns the same object reference if nothing changed, a new object if changed.
 */
function replaceInFields(
  fields: Record<string, unknown>,
  oldUrl: string,
  newUrl: string,
): Record<string, unknown> {
  let changed = false
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.includes(oldUrl)) {
      result[key] = value.replaceAll(oldUrl, newUrl)
      changed = true
    } else if (Array.isArray(value)) {
      const newArr = replaceInArray(value, oldUrl, newUrl)
      result[key] = newArr.result
      if (newArr.changed) changed = true
    } else if (value && typeof value === 'object') {
      const newObj = replaceInFields(value as Record<string, unknown>, oldUrl, newUrl)
      result[key] = newObj
      if (newObj !== value) changed = true
    } else {
      result[key] = value
    }
  }

  return changed ? result : fields
}

function replaceInArray(
  arr: unknown[],
  oldUrl: string,
  newUrl: string,
): { result: unknown[]; changed: boolean } {
  let changed = false
  const result = arr.map((item) => {
    if (typeof item === 'string' && item.includes(oldUrl)) {
      changed = true
      return item.replaceAll(oldUrl, newUrl)
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const newObj = replaceInFields(item as Record<string, unknown>, oldUrl, newUrl)
      if (newObj !== item) changed = true
      return newObj
    }
    if (Array.isArray(item)) {
      const nested = replaceInArray(item, oldUrl, newUrl)
      if (nested.changed) changed = true
      return nested.result
    }
    return item
  })
  return { result, changed }
}
