import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { composePageJsonLd } from '@krantho/api'
import type { KranthoConfig } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'
import type {
  ContentRef,
  IPublishedContentLoader,
  IPublishedSeoLoader,
  PublishedContent,
  PublishedSummary,
} from '@krantho/core'
import {
  documentPath,
  documentReadTags,
  jsonLdTags,
  listReadTags,
  pageCollection,
  seoReadTags,
} from '@krantho/core'
import type {
  ContentDocument,
  ContentSummary,
  ISeoConfigAdapter,
  PublishedReader,
} from '@krantho/persistence'
import { canGetContent, canReadPublished } from '@krantho/persistence'
import type { ContentConfig } from '@krantho/schema'
import { defineConfig } from '@krantho/schema'
import { documentSeoProperties } from '@krantho/seo-shared'
import { importRepositoryContent } from './content-migration.js'
import type { KranthoHandlerOptions } from './handler.js'
import { createLockAdapters } from './lock-adapters.js'
import { inPreviewRequest, recordReadTags } from './page-request.js'
import { createAdapter } from './persistence.js'
import type { ReadCache } from './read-cache.js'
import { createReadCache } from './read-cache.js'
import { seedSeoOnce } from './seo-seed.js'

/** The page reads over one version of each document */
type ReadViewLoader = IPublishedContentLoader & IPublishedSeoLoader

/** What server-rendered pages read: published content, the pages' SEO, and a preview view */
export interface ContentLoader extends IPublishedContentLoader, IPublishedSeoLoader {
  /**
   * The same reads for an editor's preview: a document and its JSON-LD come
   * from its current version, draft included, and nothing is cached
   */
  readonly preview: IPublishedContentLoader & IPublishedSeoLoader
}

/** Reads one version of a document: the live one, or the current one for a preview */
type VersionReader = (
  reader: PublishedReader,
  ref: ContentRef,
  locale: string,
) => Promise<ContentDocument | null>

const liveVersion: VersionReader = (reader, ref, locale) =>
  reader.getPublished(ref.collection, ref.slug, locale)

const currentVersion: VersionReader = async (reader, ref, locale) => {
  // Every database adapter reads single documents; one that cannot previews nothing
  if (!canGetContent(reader)) return null
  const doc = await reader.getContent(ref.collection, ref.slug, locale)
  return doc && doc.meta.status !== 'deleted' ? doc : null
}

/**
 * Create the content loader server-rendered pages read through.
 *
 * Pages read only the live (published) version of a document — never a newer
 * draft — by collection, slug and locale; an omitted locale is the site's
 * default. The loader takes the configuration and collections the API handler
 * takes, opens persistence through the same factory, and runs the same startup
 * content import and SEO seed before its first read returns — so pages and the
 * API read one database, and a fresh one is filled and configured whichever of
 * them a deployment serves first. The adapter opens on the first read, not at
 * import time, and a failed open is retried on the next read. Reads are cached
 * per `content.cache`, except with `cache.pages: 'next-isr'`, where Next.js
 * caches them, and with `cache.pages: 'cdn'`, where
 * the CDN caches the pages: a publish purges the CDN, and the next render must
 * read the new version, not a cached one the CDN would then keep.
 *
 * It also serves the pages' SEO: configuration properties, and each page's
 * JSON-LD composed from its published fields — in-process, the way the API's
 * preview composes it, so no page calls the site's own API. Its `preview` view
 * reads the current version instead, for an editor previewing a draft.
 *
 * Inside `runPageRequest()` every read records its cache tags into the
 * request, and a preview request reads through the `preview` view;
 * `isPreview()` says which a render reads.
 */
export function createContentLoader(
  options: Pick<KranthoHandlerOptions, 'config' | 'collections'>,
): ContentLoader {
  let resolved: KranthoConfig | undefined
  let opening: Promise<OpenStore> | null = null
  let cache: ReadCache | undefined

  function settings(): KranthoConfig {
    resolved ??= loadConfig({ code: options.config, env: process.env })
    return resolved
  }

  function store(): Promise<OpenStore> {
    opening ??= openStore(settings(), defineConfig({ collections: options.collections })).catch(
      (err: unknown) => {
        opening = null
        throw err
      },
    )
    return opening
  }

  function reads(): ReadCache {
    // With Next.js ISR, Next's data cache is the only page-side cache; behind a CDN, the CDN is
    const { content, cache: pageCache } = settings()
    const cachedElsewhere = pageCache.pages === 'next-isr' || pageCache.pages === 'cdn'
    cache ??= createReadCache(
      cachedElsewhere ? { ...content.cache, enabled: false } : content.cache,
    )
    return cache
  }

  const uncached = createReadCache({ enabled: false, ttlMs: 0, maxEntries: 1 })
  const view = (version: VersionReader, isPreview: boolean, cached: () => ReadCache) =>
    readView({
      settings,
      store,
      version,
      preview: isPreview,
      cache: cached,
      collections: options.collections,
    })

  const live = view(liveVersion, false, reads)
  const preview = view(currentVersion, true, () => uncached)
  return { ...previewInScope(live, preview), preview }
}

/** The live view, served from the preview view while a preview page request runs */
function previewInScope(live: ReadViewLoader, preview: ReadViewLoader): ReadViewLoader {
  const active = (): ReadViewLoader => (inPreviewRequest() ? preview : live)
  return {
    isPreview: () => active().isPreview(),
    getPublished: (ref) => active().getPublished(ref),
    listPublished: (collection, locale) => active().listPublished(collection, locale),
    listPublishedSummaries: (collection, locale) =>
      active().listPublishedSummaries(collection, locale),
    seoProperties: (configId, locale) => active().seoProperties(configId, locale),
    jsonLd: (ref, structure) => active().jsonLd(ref, structure),
  }
}

/**
 * The site's identity from configuration, which the primary site entity
 * carries unless its SEO settings set a value of their own
 */
function siteIdentity(site: KranthoConfig['site']): Record<string, unknown> {
  const identity: Record<string, unknown> = { name: site.name, url: site.baseUrl }
  if (site.logo) identity.logo = site.logo
  if (site.description) identity.description = site.description
  if (site.alternateName) identity.alternateName = site.alternateName
  if (site.sameAs.length > 0) identity.sameAs = site.sameAs
  return identity
}

interface ReadViewOptions {
  settings: () => KranthoConfig
  store: () => Promise<OpenStore>
  version: VersionReader
  /** Whether this view is an editor's preview */
  preview: boolean
  cache: () => ReadCache
  /** Where each collection's documents render: the path in a page's JSON-LD */
  collections: KranthoHandlerOptions['collections']
}

/** The page reads over one version of each document; each records its tags into the page request */
function readView({
  settings,
  store,
  version,
  preview,
  cache,
  collections,
}: ReadViewOptions): ReadViewLoader {
  const localeOf = (ref: ContentRef): string => ref.locale ?? settings().site.defaultLocale
  return {
    isPreview: async () => preview,
    getPublished: (ref) => {
      recordReadTags(documentReadTags(ref.collection, ref.slug))
      const locale = localeOf(ref)
      return cache().read(`doc:${ref.collection}:${ref.slug}:${locale}`, async () => {
        const doc = await version((await store()).adapter, ref, locale)
        return doc ? toPublished(doc) : null
      })
    },
    listPublished: (collection, locale) => {
      recordReadTags(listReadTags(collection))
      const loc = locale ?? settings().site.defaultLocale
      return cache().read(`list:${collection}:${loc}`, async () => {
        const { items } = await (await store()).adapter.query({
          state: 'published',
          projection: 'full',
          collections: [collection],
          locale: loc,
        })
        return items.map(toPublished)
      })
    },
    listPublishedSummaries: (collection, locale) => {
      recordReadTags(listReadTags(collection))
      const loc = locale ?? settings().site.defaultLocale
      return cache().read(`summaries:${collection}:${loc}`, async () => {
        const { items } = await (await store()).adapter.query({
          state: 'published',
          projection: 'summary',
          collections: [collection],
          locale: loc,
        })
        return items.map(toPublishedSummary)
      })
    },
    seoProperties: (configId, locale) => {
      recordReadTags(seoReadTags(configId))
      return cache().read(
        `seo:${configId}:${locale ?? settings().site.defaultLocale}`,
        async () => {
          if (configId.startsWith('doc:')) {
            const key = configId.slice(4)
            const slash = key.indexOf('/')
            if (slash < 1) return {}
            const ref = { collection: key.slice(0, slash), slug: key.slice(slash + 1), locale }
            recordReadTags(documentReadTags(ref.collection, ref.slug))
            const doc = await version((await store()).adapter, ref, localeOf(ref))
            return doc ? documentSeoProperties(doc.metadata) : {}
          }
          const entry = await (await store()).seoConfigs?.getConfig(configId)
          const properties = entry?.config.entities[0]?.properties ?? {}
          return configId === 'site'
            ? { ...siteIdentity(settings().site), ...properties }
            : properties
        },
      )
    },
    // Document SEO configuration is per document, shared by its locales; the
    // graph is composed from the requested locale's fields.
    jsonLd: (ref, structure) => {
      recordReadTags(jsonLdTags(ref.collection, ref.slug))
      const locale = localeOf(ref)
      const shape = structure ? `:${JSON.stringify(structure)}` : ''
      return cache().read(`jsonld:${ref.collection}:${ref.slug}:${locale}${shape}`, async () => {
        const { adapter, seoConfigs } = await store()
        const doc = await version(adapter, ref, locale)
        if (!doc) return null
        return composePageJsonLd({
          collection: ref.collection,
          slug: ref.slug,
          path: documentPath(pageCollection(collections, ref.collection), ref.slug),
          fields: doc.fields,
          metadata: doc.metadata,
          documentMeta: doc.meta,
          config: settings(),
          seoConfigs,
          structure,
        })
      })
    },
  }
}

/** The stores a loader reads: published content, and SEO configuration when the database keeps it */
interface OpenStore {
  adapter: PublishedReader
  seoConfigs: ISeoConfigAdapter | undefined
}

async function openStore(config: KranthoConfig, contentConfig: ContentConfig): Promise<OpenStore> {
  if (config.persistence.provider === 'sqlite') {
    await mkdir(dirname(config.persistence.sqlite.path), { recursive: true })
  }
  const { adapter, lockDb, contentMigrationAdapter, checkpointAdapter } = await createAdapter(
    config.persistence,
    config.site,
    config.content,
    contentConfig.collections,
  )
  await importRepositoryContent(
    adapter,
    contentConfig,
    contentMigrationAdapter,
    checkpointAdapter,
    config.paths.contentDir,
    config.content.defaultStatus.filesystem,
  )
  if (!canReadPublished(adapter)) {
    throw new Error(
      `The ${config.persistence.provider} persistence adapter cannot read published content`,
    )
  }
  const { seoConfigAdapter } = await createLockAdapters(lockDb, config.persistence.provider)
  if (seoConfigAdapter) await seedSeoOnce(config, seoConfigAdapter)
  return { adapter, seoConfigs: seoConfigAdapter }
}

function toPublishedSummary(doc: ContentSummary): PublishedSummary {
  return {
    collection: doc.meta.collection,
    slug: doc.meta.slug,
    locale: doc.meta.locale,
    metadata: doc.metadata,
    fields: doc.fields,
    publishedAt: new Date(doc.meta.createdAt),
  }
}

function toPublished(doc: ContentDocument): PublishedContent {
  return { ...toPublishedSummary(doc), body: doc.body }
}
