import type {
  ContentRef,
  IPublishedContentLoader,
  IPublishedSeoLoader,
  PublishedContent,
  PublishedSummary,
} from '@krantho/core'
import { documentReadTags, jsonLdTags, listReadTags, seoReadTags } from '@krantho/core'
import { createContentLoader as createStoreLoader } from '@krantho/server'
import { unstable_cache } from 'next/cache'
import { pageCacheSwitch } from './page-cache.js'
import { isPreview } from './site-preview.js'

type LoaderOptions = Parameters<typeof createStoreLoader>[0]

/** A published document as the Next.js data cache stores it: JSON, so the date is a string */
type StoredContent = Omit<PublishedContent, 'publishedAt'> & { publishedAt: string }

/** A published summary as the data cache stores it */
type StoredSummary = Omit<PublishedSummary, 'publishedAt'> & { publishedAt: string }

/**
 * Create the content loader server components read through.
 *
 * It reads the database the API route opens (see `createContentLoader()` in
 * `@krantho/server`). With `cache.pages: 'next-isr'`, every read goes through
 * the Next.js data cache, tagged with what it read — the document, the
 * collection, the SEO configuration — so a page rendered from it stays cached
 * until the API route invalidates one of those tags (in production; `next dev`
 * reads the database every time). This is the one place krantho touches
 * `unstable_cache`. In an editor's preview (draft mode, `isPreview()`), every
 * read comes from the current versions, drafts included, uncached.
 */
export function createContentLoader(
  options: LoaderOptions,
): IPublishedContentLoader & IPublishedSeoLoader {
  const store = createStoreLoader(options)
  const cached = pageCacheSwitch(options.config)

  return {
    isPreview,
    getPublished: async (ref) => {
      if (await isPreview()) return store.preview.getPublished(ref)
      if (!cached()) return store.getPublished(ref)
      return unstable_cache(
        async () => toStored(await store.getPublished(ref)),
        ['krantho', 'doc', ...refKey(ref)],
        { tags: documentReadTags(ref.collection, ref.slug) },
      )().then(fromStored)
    },
    listPublished: async (collection, locale) => {
      if (await isPreview()) return store.preview.listPublished(collection, locale)
      if (!cached()) return store.listPublished(collection, locale)
      return unstable_cache(
        async () => (await store.listPublished(collection, locale)).map(toStoredDoc),
        ['krantho', 'list', collection, locale ?? ''],
        { tags: listReadTags(collection) },
      )().then((docs) => docs.map(fromStoredDoc))
    },
    listPublishedSummaries: async (collection, locale) => {
      if (await isPreview()) return store.preview.listPublishedSummaries(collection, locale)
      if (!cached()) return store.listPublishedSummaries(collection, locale)
      return unstable_cache(
        async () => (await store.listPublishedSummaries(collection, locale)).map(toStoredSummary),
        ['krantho', 'summaries', collection, locale ?? ''],
        { tags: listReadTags(collection) },
      )().then((docs) => docs.map(fromStoredSummary))
    },
    seoProperties: async (configId, locale) => {
      if (await isPreview()) return store.preview.seoProperties(configId, locale)
      if (!cached()) return store.seoProperties(configId, locale)
      return unstable_cache(
        () => store.seoProperties(configId, locale),
        ['krantho', 'seo', configId, locale ?? ''],
        {
          tags: seoReadTags(configId),
        },
      )()
    },
    // The page's structure is part of what the graph states, so it is part of the cache key
    jsonLd: async (ref, structure) => {
      if (await isPreview()) return store.preview.jsonLd(ref, structure)
      if (!cached()) return store.jsonLd(ref, structure)
      const shape = structure ? [JSON.stringify(structure)] : []
      return unstable_cache(
        () => store.jsonLd(ref, structure),
        ['krantho', 'jsonld', ...refKey(ref), ...shape],
        { tags: jsonLdTags(ref.collection, ref.slug) },
      )()
    },
  }
}

function refKey(ref: ContentRef): string[] {
  return [ref.collection, ref.slug, ref.locale ?? '']
}

function toStored(doc: PublishedContent | null): StoredContent | null {
  return doc ? toStoredDoc(doc) : null
}

function toStoredDoc(doc: PublishedContent): StoredContent {
  return { ...doc, publishedAt: doc.publishedAt.toISOString() }
}

function fromStored(doc: StoredContent | null): PublishedContent | null {
  return doc ? fromStoredDoc(doc) : null
}

function fromStoredDoc(doc: StoredContent): PublishedContent {
  return { ...doc, publishedAt: new Date(doc.publishedAt) }
}

function toStoredSummary(doc: PublishedSummary): StoredSummary {
  return { ...doc, publishedAt: doc.publishedAt.toISOString() }
}

function fromStoredSummary(doc: StoredSummary): PublishedSummary {
  return { ...doc, publishedAt: new Date(doc.publishedAt) }
}
