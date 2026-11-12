import type { DefaultProvenance, RepositoryDocument } from '@krantho/core'
import { localeQuery, request } from './api-client.js'
import type {
  CollectionInfo,
  CollectionSchema,
  CollectionTranslationStatus,
  ContentItem,
  ContentSummaryItem,
  ContentTree,
  DocumentMeta,
  RuntimeFieldDefinition,
  RuntimeSchemaResponse,
  SearchResult,
  SummaryListResult,
  WebhookDelivery,
} from './api-types.js'

/** Fetch all collections */
export async function fetchCollections(): Promise<CollectionInfo[]> {
  const result = await request<{ collections: CollectionInfo[] }>('/collections')
  return result.collections
}

/** Fetch a collection's documents as their meta and fields, without body, HTML or sections */
export async function fetchCollectionItems(
  collection: string,
  query?: {
    status?: string | undefined
    sort?: string | undefined
    limit?: number | undefined
    offset?: number | undefined
    locale?: string | undefined
  },
): Promise<SummaryListResult> {
  const params = new URLSearchParams({ view: 'summary' })
  if (query?.status) params.set('status', query.status)
  if (query?.sort) params.set('sort', query.sort)
  if (query?.limit !== undefined) params.set('limit', String(query.limit))
  if (query?.offset !== undefined) params.set('offset', String(query.offset))
  if (query?.locale) params.set('locale', query.locale)

  const qs = params.toString()
  return request<SummaryListResult>(`/content/${collection}?${qs}`)
}

/**
 * Which documents there are and in what state, for every collection in one locale: the meta of
 * each, and no content. One request, a few hundred bytes a document.
 */
export async function fetchContentTree(locale: string): Promise<ContentTree> {
  return request<ContentTree>(`/content-tree?locale=${encodeURIComponent(locale)}`)
}

/** The page size used when reading every document */
const LIST_PAGE_SIZE = 500

/** What `fetchAllDocuments` reads: `collections` (every collection when absent), `locale` (every locale), `status` */
interface DocumentsQuery {
  collections?: readonly string[] | undefined
  locale?: string | undefined
  status?: string | undefined
}

/**
 * Every document the query names, across collections, read page by page from `GET /api/content`.
 * The API orders rows by collection, slug and locale, so pages neither skip nor repeat. The API
 * caps each page at its configured limit, so the next offset follows what actually came back,
 * and the read ends on the page that reports no `hasMore` or comes back empty.
 */
export async function fetchAllDocuments(
  query: DocumentsQuery & { view: 'meta' },
): Promise<DocumentMeta[]>
export async function fetchAllDocuments(
  query?: DocumentsQuery & { view?: 'summary' },
): Promise<ContentSummaryItem[]>
export async function fetchAllDocuments(
  query: DocumentsQuery & { view?: 'summary' | 'meta' } = {},
): Promise<Array<ContentSummaryItem | DocumentMeta>> {
  const items: Array<ContentSummaryItem | DocumentMeta> = []
  for (;;) {
    const params = new URLSearchParams({ view: query.view ?? 'summary' })
    if (query.collections?.length) params.set('collections', query.collections.join(','))
    if (query.locale) params.set('locale', query.locale)
    if (query.status) params.set('status', query.status)
    params.set('limit', String(LIST_PAGE_SIZE))
    params.set('offset', String(items.length))
    const page = await request<{
      items: Array<ContentSummaryItem | DocumentMeta>
      hasMore: boolean
    }>(`/content?${params}`)
    items.push(...page.items)
    if (!page.hasMore || page.items.length === 0) return items
  }
}

/** Fetch a single content item */
export async function fetchContent(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<ContentItem> {
  return request<ContentItem>(`/content/${collection}/${slug}${localeQuery(locale)}`)
}

/** Fetch JSON Schema for a collection */
export async function fetchSchema(collection: string): Promise<CollectionSchema> {
  return request<CollectionSchema>(`/schema/${collection}`)
}

/** What the API reports after a create or a save: the new current version and the live one */
export interface SavedContent {
  slug: string
  collection: string
  version: number
  liveVersion: number | null
  message: string
}

/** Create a new content item */
export async function createContentItem(
  collection: string,
  data: {
    slug: string
    defaults?: readonly DefaultProvenance[] | undefined
    metadata?: Record<string, Record<string, unknown>> | undefined
    fields: Record<string, unknown>
    body: string
    locale?: string | undefined
  },
): Promise<SavedContent> {
  return request(`/content/${collection}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Update an existing content item — sends _version for optimistic concurrency */
export async function updateContentItem(
  collection: string,
  slug: string,
  data: {
    defaults?: readonly DefaultProvenance[] | undefined
    metadata?: Record<string, Record<string, unknown>> | undefined
    fields: Record<string, unknown>
    body?: string | undefined
    _version?: number | undefined
    locale?: string | undefined
  },
): Promise<SavedContent> {
  return request(`/content/${collection}/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** What publishing a document would refresh, from `GET /api/content/:c/:s/publish-impact` */
export interface PublishImpact {
  collection: string
  slug: string
  locale: string
  /** The page paths whose cached copies refresh */
  paths: string[]
  /** The collections whose lists refresh */
  lists: string[]
  /** A global: every page that reads it refreshes as visitors open it */
  everyPageReading: boolean
  caching: 'none' | 'next-isr' | 'cdn'
  tags: string[]
  /** Cached entries carrying the change; null when krantho does not know (no shared cache) */
  cachedEntries: number | null
}

/** What publishing a document in a locale would refresh, before it happens */
export async function fetchPublishImpact(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<PublishImpact> {
  return request<PublishImpact>(
    `/content/${collection}/${slug}/publish-impact${localeQuery(locale)}`,
  )
}

/** Delete a content item */
/**
 * Change what visitors see of a document in a locale: `published` makes its
 * current version live, `draft` unpublishes, `archived` archives; without a
 * status it toggles
 */
export async function publishContentItem(
  collection: string,
  slug: string,
  options?: { status?: string; locale?: string | undefined },
): Promise<{
  slug: string
  status: string
  version: number | null
  liveVersion: number | null
  message: string
}> {
  const init: RequestInit = { method: 'POST' }
  if (options?.status) init.body = JSON.stringify({ status: options.status })
  return request(`/content/${collection}/${slug}/publish${localeQuery(options?.locale)}`, init)
}

/** Search content across collections */
export async function searchContent(query: string): Promise<SearchResult> {
  return request<SearchResult>(`/content/search?q=${encodeURIComponent(query)}`)
}

/** Delete each slug's document in `locale` (the site's default locale when absent) */
export async function bulkDeleteItems(
  collection: string,
  slugs: string[],
  locale?: string | undefined,
): Promise<{
  results: Array<{ slug: string; deleted: boolean; error?: string | undefined }>
  deleted: number
}> {
  return request(`/content/${collection}/bulk`, {
    method: 'DELETE',
    body: JSON.stringify(locale ? { slugs, locale } : { slugs }),
  })
}

/** Publish the current version of each slug, in `locale` (the site's default locale when absent) */
export async function bulkPublishItems(
  collection: string,
  slugs: string[],
  locale?: string | undefined,
): Promise<{
  results: Array<{ slug: string; published: boolean; error?: string | undefined }>
  published: number
}> {
  return request(`/content/${collection}/bulk-publish`, {
    method: 'POST',
    body: JSON.stringify(locale ? { slugs, locale } : { slugs }),
  })
}

/** Fetch runtime schema extensions for a collection */
export async function fetchRuntimeSchema(collection: string): Promise<RuntimeSchemaResponse> {
  return request<RuntimeSchemaResponse>(`/schema/${collection}/runtime`)
}

/** Save a runtime field to a collection */
export async function saveRuntimeField(
  collection: string,
  field: RuntimeFieldDefinition,
): Promise<{ message: string; field: RuntimeFieldDefinition }> {
  return request(`/schema/${collection}/fields`, {
    method: 'PUT',
    body: JSON.stringify(field),
  })
}

/** Delete a runtime field from a collection */
export async function deleteRuntimeField(
  collection: string,
  fieldName: string,
): Promise<{ message: string }> {
  return request(`/schema/${collection}/fields/${fieldName}`, { method: 'DELETE' })
}

/** Export merged schema as Zod code */
export async function exportSchemaCode(
  collection: string,
): Promise<{ collection: string; code: string }> {
  return request(`/schema/${collection}/export`)
}

/** Export content from a collection */
export async function exportCollection(
  collection: string,
  format: 'json' | 'markdown' = 'json',
  locale?: string | undefined,
): Promise<{
  collection: string
  format: string
  count: number
  items?: Array<Record<string, unknown>>
  files?: Array<{ slug: string; content: string }>
}> {
  const params = new URLSearchParams({ format })
  if (locale) params.set('locale', locale)
  return request(`/content/${collection}/export?${params}`)
}

/** Import content into a collection */
export async function importCollection(
  collection: string,
  items: RepositoryDocument[],
): Promise<{
  collection: string
  imported: number
  total: number
  results: Array<{ slug: string; imported: boolean; error?: string }>
}> {
  return request(`/content/${collection}/import`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

/** Fetch webhook delivery log */
export async function fetchWebhookDeliveries(query?: {
  limit?: number | undefined
  offset?: number | undefined
  status?: 'pending' | 'delivered' | 'failed' | undefined
}): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
  const params = new URLSearchParams()
  if (query?.limit !== undefined) params.set('limit', String(query.limit))
  if (query?.offset !== undefined) params.set('offset', String(query.offset))
  if (query?.status) params.set('status', query.status)
  const qs = params.toString()
  return request<{ deliveries: WebhookDelivery[]; total: number }>(
    `/webhooks/deliveries${qs ? `?${qs}` : ''}`,
  )
}

/**
 * Retry a failed webhook delivery: the API puts it back in the queue and sends
 * it again at once, answering with it pending
 */
export async function retryWebhookDelivery(id: number): Promise<{ delivery: WebhookDelivery }> {
  return request(`/webhooks/deliveries/${id}/retry`, { method: 'POST' })
}

/** Fetch translation coverage status */
export async function fetchTranslationStatus(): Promise<{
  supportedLocales: string[]
  defaultLocale: string
  collections: CollectionTranslationStatus[]
}> {
  return request<{
    supportedLocales: string[]
    defaultLocale: string
    collections: CollectionTranslationStatus[]
  }>('/translations/status')
}
