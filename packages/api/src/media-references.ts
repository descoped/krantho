import { type ContentDocument, canQuery } from '@krantho/persistence'
import type { ApiContext } from './types.js'

/** A document field, or its markdown body, that names a media file */
export interface MediaReference {
  collection: string
  slug: string
  field: string
}

/** The places in one document that name the file: its text fields, then its body */
function referencesIn(doc: ContentDocument, id: string): MediaReference[] {
  const { collection, slug } = doc.meta
  const fields = Object.entries(doc.fields).flatMap(([field, value]) =>
    typeof value === 'string' && value.includes(id) ? [{ collection, slug, field }] : [],
  )
  return doc.body.includes(id) ? [...fields, { collection, slug, field: 'body' }] : fields
}

/**
 * Where each of the media files is used: every collection is read once, in one
 * query, whatever the number of files asked about. A read that fails fails the
 * answer — an answer of no references is never a guess.
 */
export async function mediaReferences(
  ctx: ApiContext,
  ids: readonly string[],
): Promise<Map<string, MediaReference[]>> {
  const found = new Map(ids.map((id) => [id, [] as MediaReference[]]))
  const collections = [...ctx.contentConfig.collections.keys()]
  if (ids.length === 0 || collections.length === 0 || !canQuery(ctx.adapter)) return found
  const { items } = await ctx.adapter.query({ state: 'current', projection: 'full', collections })
  for (const doc of items) {
    for (const id of ids) found.get(id)?.push(...referencesIn(doc, id))
  }
  return found
}
