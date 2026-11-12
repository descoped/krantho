/**
 * What a committed write changed, as far as rendered pages are concerned.
 *
 * - `document`: one document. `live` is false for a save, which leaves the
 *   published page as it is; it is true for a publication, a delete, and a save
 *   where saves are live (the filesystem adapter, which keeps no history).
 * - `seo`: an SEO configuration (`site`, `collection:<name>`, `route:<pattern>`; a document's
 *   own SEO changes with the document), or every configuration when `configId` is omitted.
 * - `media`: one media asset's file or metadata.
 * - `site`: anything site-wide (checkpoint restore, bundle import, startup import).
 */
export type ContentChange =
  | {
      kind: 'document'
      collection: string
      slug: string
      locale?: string | undefined
      live: boolean
    }
  | { kind: 'seo'; configId?: string | undefined }
  | { kind: 'media'; id: string }
  | { kind: 'site' }

/**
 * Called once per committed write — inside the request that made it, or later
 * for a background job's writes
 */
export type ContentChangeListener = (change: ContentChange) => void | Promise<void>
