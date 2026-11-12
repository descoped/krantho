import { rendersPages } from '@krantho/core'
import type { ApiHandler } from '../types.js'

/** GET /api/collections — list all defined collections with metadata */
export const listCollections: ApiHandler = async (_req, ctx) => {
  const collections: Array<{
    name: string
    source: 'filesystem' | 'database'
    directory: string | undefined
    /** Whether its documents render as pages (the collection's `path`) */
    pages: boolean
    /** The URL pattern it declares (`/docs/:slug`), `false` for no pages; absent for the default rule */
    path?: string | false
    /** The `##` sections its page template designs, in order */
    sections: readonly string[]
  }> = []

  for (const [name, collection] of ctx.contentConfig.collections) {
    collections.push({
      name,
      source: collection.source,
      directory: collection.directory,
      pages: rendersPages(collection),
      sections: collection.sections,
      ...(collection.path !== undefined ? { path: collection.path } : {}),
    })
  }

  return { status: 200, body: { collections } }
}
