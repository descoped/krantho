import { useCallback } from 'react'
import { fetchCollections, fetchContent, fetchSchema } from '../lib/api.js'
import type {
  CollectionInfo,
  CollectionSchema,
  ContentItem,
  SiteConfigResponse,
} from '../lib/api-types.js'
import { isNotFound } from '../lib/fetch.js'
import { loadLocales, type SiteLocales } from '../lib/locales.js'
import { loadSiteConfig } from '../lib/site-config.js'
import { type Loaded, useLoaded } from '../site/use-loaded.js'

/** What the editor opens with */
export interface EditorSource {
  schema: CollectionSchema
  /** The collection as the API lists it: whether and where its documents render */
  collection: CollectionInfo | null
  /** The saved document; null for a new one */
  document: ContentItem | null
  /** The site's public configuration: where it lives; null when unreadable */
  site: SiteConfigResponse | null
  /** The site's locales as set in Setup › Locales; null when unreadable */
  locales: SiteLocales | null
}

/** The document to open: a slug for a saved one, none for a new one */
export interface EditorTarget {
  collection: string
  slug: string | undefined
  /** The locale asked for; the site's default locale when absent */
  locale: string | undefined
}

async function loadSource(target: EditorTarget): Promise<EditorSource | null> {
  try {
    const [schema, collections, document, site, locales] = await Promise.all([
      fetchSchema(target.collection),
      fetchCollections().catch(() => [] as CollectionInfo[]),
      target.slug ? fetchContent(target.collection, target.slug, target.locale) : null,
      loadSiteConfig(),
      loadLocales().catch(() => null),
    ])
    const collection = collections.find((c) => c.name === target.collection) ?? null
    return { schema, collection, document, site, locales }
  } catch (err: unknown) {
    // An unknown collection or document is not found, not a failure to load
    if (isNotFound(err)) return null
    throw err
  }
}

/** The schema, the collection and the document; `null` once loaded means not found */
export function useEditorSource(target: EditorTarget): {
  loaded: Loaded<EditorSource | null>
  reload: () => void
} {
  const { collection, slug, locale } = target
  const load = useCallback(
    () => loadSource({ collection, slug, locale }),
    [collection, slug, locale],
  )
  return useLoaded(load, 'The document could not load')
}
