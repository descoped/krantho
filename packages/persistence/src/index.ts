import type { AuthoredMetadata } from './content-contract.js'

export type {
  AuthoredMetadata,
  AuthoredWrite,
  ContentContract,
  ContractReference,
  DefaultProvenance,
  MetadataGroupContract,
} from './content-contract.js'
export {
  authoredMetadata,
  authoredOf,
  ContentWriteConflict,
  documentSeoRow,
  nextAuthored,
  sameAuthoredValues,
} from './content-contract.js'

import type { ContentMetadata, IContentLoader } from '@krantho/core'
import type { SeoConfigData } from '@krantho/seo-shared'
import type { ContentQuery, QueryPage, QueryProjection } from './content-query.js'
import type { Publication } from './live-version.js'

// --- Auth ---
export type {
  CreateUserData,
  IAuthAdapter,
  RefreshTokenRecord,
  Role,
  UpdateUserData,
  UserPermission,
  UserRecord,
} from './auth.js'
export type {
  ContentQuery,
  CurrentQuery,
  MatchTarget,
  PublishedQuery,
  QueryItem,
  QueryPage,
  QueryProjection,
  QueryReader,
} from './content-query.js'
export { canQuery } from './content-query.js'

// --- Content Row Mapping (shared across adapters) ---
export type {
  NormalizedContentRow,
  NormalizedMetaRow,
  NormalizedSummaryRow,
} from './content-row.js'
export {
  contentDocumentFromRow,
  contentSummaryFromRow,
  documentMetaFromRow,
} from './content-row.js'

// --- Live-version rules (shared across adapters) ---
export type { LiveDirective, Publication } from './live-version.js'
export {
  currentIsLive,
  liveOnWrite,
  publicationOfFile,
  resolveLiveVersion,
  statusCondition,
  statusOf,
  storedStatus,
} from './live-version.js'
// --- Shared Migration Utilities ---
export type { MigrationDecision, MigrationIdentity } from './migration-utils.js'
export {
  decideMigration,
  migrationFailedMessage,
  resolveCurrentVersion,
  validateChecksums,
} from './migration-utils.js'

// --- Migrations & Checkpoints ---
export type {
  AppliedMigration,
  CheckpointInfo,
  CheckpointTrigger,
  ConflictResolution,
  ContentConflict,
  ContentManifest,
  ContentManifestRecord,
  ICheckpointAdapter,
  IContentMigrationAdapter,
  Migration,
  MigrationApplyFn,
  MigrationResult,
  MigrationStatus,
} from './migrations.js'
// --- Sort Whitelist (shared across SQL adapters) ---
export type { DirectSortColumn } from './sort-columns.js'
export {
  DIRECT_SORT_COLUMNS,
  isDirectSortColumn,
  isSafeSortField,
  SORT_FIELD_PATTERN,
} from './sort-columns.js'
export type { ContentMetadata, IContentLoader }

// --- Content Document Model ---

/** Content source — how this content entered the system */
export type ContentSource = 'filesystem' | 'api' | 'import'

/**
 * A document's publication state as of a version: published while a version is
 * live, draft when none is, archived (offline, kept), deleted (a tombstone)
 */
export type ContentStatus = 'draft' | 'published' | 'archived' | 'deleted'

/** System metadata — managed by the CMS runtime, not by content authors */
export interface DocumentMeta {
  collection: string
  slug: string
  locale: string
  version: number
  /** The live version as of this version — the document's live version when this is its current one; null when nothing is live */
  liveVersion: number | null
  status: ContentStatus
  source: ContentSource
  changedBy: string | null
  createdAt: string
}

/** A content document in the CMS */
export interface ContentDocument extends AuthoredMetadata {
  meta: DocumentMeta
  /** Schema-validated content fields (structured data, no system fields) */
  fields: Record<string, unknown>
  /** Raw markdown body */
  body: string
  /** Rendered HTML */
  html: string
  /** Extracted h2 sections */
  sections: Record<string, string>
}

/**
 * A document without its content: the meta and the fields, and no body, HTML or
 * sections. Lists that only name, order or filter documents read this much, which
 * is a fraction of what a full document weighs on the wire.
 */
export interface ContentSummary {
  meta: DocumentMeta
  fields: Record<string, unknown>
  /** The authored metadata groups, without the contract, defaults provenance, body or HTML */
  metadata: AuthoredMetadata['metadata']
}

/** Data for writing content to the persistence layer */
export interface WriteContentData extends Partial<AuthoredMetadata> {
  /** Atomic compare-and-swap, zero requires a new document. */
  expectedVersion?: number | undefined
  collection: string
  slug: string
  fields: Record<string, unknown>
  body: string
  html?: string | undefined
  sections?: Record<string, string> | undefined
  /** What the write does to the live version; without one it is a save and the live version is kept */
  publication?: Publication | undefined
  locale?: string | undefined
}

export interface IPersistenceAdapter extends IContentLoader {
  /** List all content slugs */
  listSlugs(): Promise<string[]>

  /**
   * Write a document — appends a new version. A save keeps the live version;
   * `publication` publishes the written version, unpublishes or archives.
   */
  writeContent?(data: WriteContentData, changedBy?: string | undefined): Promise<void>

  /** Soft-delete content — creates a tombstone version */
  deleteContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
    changedBy?: string | undefined,
  ): Promise<void>

  /** Get a single content document */
  getContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** The live (published) version of a document, or null when nothing is live */
  getPublished?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** The one read behind every content list: a declared projection over one or many collections, current or live, optionally matched on text, as one page */
  query?<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>>

  /** List version history for a content item (newest first) */
  listVersions?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<DocumentMeta[]>

  /** Get a specific version of a content document */
  getVersion?(
    collection: string,
    slug: string,
    version: number,
    locale?: string | undefined,
  ): Promise<ContentDocument | null>

  /** Restore content to a specific version — creates a new version from the old one */
  restoreVersion?(
    collection: string,
    slug: string,
    version: number,
    changedBy?: string | undefined,
    locale?: string | undefined,
  ): Promise<boolean>

  /** Get runtime schema extensions for a collection */
  getRuntimeSchema?(collection: string): Promise<RuntimeSchemaDefinition | null>

  /** Save runtime schema extensions for a collection — creates a new schema version */
  saveRuntimeSchema?(
    collection: string,
    schema: RuntimeSchemaDefinition,
    changedBy?: string | undefined,
  ): Promise<void>
}

// ---------------------------------------------------------------------------
// Capability predicates — type-narrowing guards for optional adapter methods.
// Use these instead of manual null checks to get TypeScript type narrowing.
// ---------------------------------------------------------------------------

/** Adapter that can read individual content documents. */
export type ContentGetter = IPersistenceAdapter & Required<Pick<IPersistenceAdapter, 'getContent'>>

/** Adapter that can read the live (published) version of documents. */
export type PublishedReader = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'getPublished' | 'query'>>

/** Adapter that can write and delete content. */
export type ContentWriter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'writeContent' | 'deleteContent'>>

/** Adapter with version history capabilities. */
export type VersioningAdapter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'listVersions' | 'getVersion' | 'restoreVersion'>>

/** Adapter with runtime schema capabilities. */
export type SchemaAdapter = IPersistenceAdapter &
  Required<Pick<IPersistenceAdapter, 'getRuntimeSchema' | 'saveRuntimeSchema'>>

/** Check if adapter can read individual documents. */
export function canGetContent(adapter: IPersistenceAdapter): adapter is ContentGetter {
  return !!adapter.getContent
}

/** Check if adapter can read the live (published) version of documents. */
export function canReadPublished(adapter: IPersistenceAdapter): adapter is PublishedReader {
  return !!adapter.getPublished && !!adapter.query
}

/** Check if adapter can write and delete content. */
export function canWriteContent(adapter: IPersistenceAdapter): adapter is ContentWriter {
  return !!adapter.writeContent && !!adapter.deleteContent
}

/** Check if adapter supports version history. */
export function hasVersioning(adapter: IPersistenceAdapter): adapter is VersioningAdapter {
  return !!adapter.listVersions && !!adapter.getVersion && !!adapter.restoreVersion
}

/** Check if adapter supports runtime schema extensions. */
export function hasRuntimeSchema(adapter: IPersistenceAdapter): adapter is SchemaAdapter {
  return !!adapter.getRuntimeSchema && !!adapter.saveRuntimeSchema
}

export interface PersistenceConfig {
  /** Path to content pages directory (e.g., 'content/pages') */
  contentPath: string
  /** Path to SEO data directory (e.g., 'content/seo') */
  seoPath: string
}

// --- Media Storage ---

/** Crop region as percentages (0-100) */
export interface MediaCrop {
  x: number
  y: number
  width: number
  height: number
}

/** Hotspot center + ellipse for adaptive aspect-ratio cropping (0-100%) */
export interface MediaHotspot {
  /** Center X as percentage of image width */
  x: number
  /** Center Y as percentage of image height */
  y: number
  /** Ellipse width as percentage of image width (for UI visualization) */
  width: number
  /** Ellipse height as percentage of image height (for UI visualization) */
  height: number
}

/** Metadata for an uploaded media item */
export interface MediaItem {
  id: string
  filename: string
  url: string
  altText: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  folder: string | null
  tags: string[]
  crop: MediaCrop | null
  hotspot: MediaHotspot | null
  createdAt: string
}

/** Options for listing media */
export interface MediaListOptions {
  limit?: number | undefined
  offset?: number | undefined
  search?: string | undefined
  folder?: string | undefined
  tag?: string | undefined
}

/** Updates accepted by the media update endpoint */
export interface MediaUpdateData {
  altText?: string | undefined
  folder?: string | null | undefined
  tags?: string[] | undefined
  crop?: MediaCrop | null | undefined
  hotspot?: MediaHotspot | null | undefined
  filename?: string | undefined
}

/** Result of a bulk delete operation */
export interface BulkDeleteResult {
  deleted: string[]
  skipped: Array<{ id: string; reason: string }>
}

/** Content item referencing a media item */
export interface MediaUsage {
  collection: string
  slug: string
  field: string
}

/** The media library's figures, over its current files */
export interface MediaStats {
  /** How many files the library holds */
  totalItems: number
  /** Their bytes, summed */
  totalSize: number
  /** How many files each folder holds, by folder id; a folder with none is absent */
  byFolder: Record<string, number>
}

/** Pluggable media storage adapter */
export interface IMediaStorage {
  /** Upload a file and store metadata */
  upload(file: Uint8Array, filename: string, mimeType: string): Promise<MediaItem>
  /** Register an externally-uploaded file (e.g., after client-side cloud upload) */
  register(item: {
    filename: string
    url: string
    mimeType: string
    size: number
    width: number | null
    height: number | null
    altText?: string | undefined
  }): Promise<MediaItem>
  /** List media with pagination and search */
  list(options?: MediaListOptions): Promise<{ items: MediaItem[]; total: number }>
  /** Get a single media item by ID */
  get(id: string): Promise<MediaItem | null>
  /** Update metadata (alt text, folder, tags, crop, filename) */
  update(id: string, updates: MediaUpdateData): Promise<MediaItem | null>
  /** Delete storage object + metadata */
  delete(id: string): Promise<void>
  /** Bulk delete multiple items */
  bulkDelete(ids: string[]): Promise<BulkDeleteResult>
  /** Bulk update alt text on multiple items */
  bulkUpdateAltText(ids: string[], altText: string): Promise<number>
  /** Replace the file, keep the id; the url changes */
  replace(
    id: string,
    file: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<MediaItem | null>
  /** Duplicate a media item (new ID, copy file) */
  duplicate(id: string): Promise<MediaItem | null>
  /** List distinct tags */
  listTags(): Promise<string[]>
  /** The library's figures: how many files, their size and each folder's count */
  stats(): Promise<MediaStats>
  /** The original file's bytes; null when the item or its file is gone */
  readOriginal(id: string): Promise<Uint8Array | null>
}

/** A media item as persisted, with the key of its file in the file store */
export interface MediaRecord extends MediaItem {
  /** Object key in the file store; null for a registered external URL */
  storageKey: string | null
}

/** A media record before the metadata adapter stamps its creation time */
export type NewMediaRecord = Omit<MediaRecord, 'createdAt'>

/** Fields a new version of a media record may change */
export type MediaRecordChanges = Partial<Omit<MediaRecord, 'id' | 'createdAt'>>

/** Versioned media metadata, kept in the configured persistence */
export interface IMediaMetadataAdapter {
  /** Insert the first version of a media record */
  insert(record: NewMediaRecord): Promise<MediaRecord>
  /** The current version of a record; null when missing or deleted */
  get(id: string): Promise<MediaRecord | null>
  /** Current records with pagination, search, folder and tag filters */
  list(options?: MediaListOptions | undefined): Promise<{ items: MediaRecord[]; total: number }>
  /** Append a new current version; null when the id has no current row */
  appendVersion(id: string, changes: MediaRecordChanges): Promise<MediaRecord | null>
  /** Append a deleted tombstone; returns the record it superseded */
  markDeleted(id: string): Promise<MediaRecord | null>
  /** Distinct tags across current records */
  listTags(): Promise<string[]>
  /** Count and size of current records, and the count in each folder */
  stats(): Promise<MediaStats>
}

/** Where a file store put an object */
export interface StoredFile {
  key: string
  /** Public URL the object is served from */
  url: string
}

/** Pluggable store for media file bytes */
export interface IFileStore {
  /** Human-readable store name, e.g. 'Local disk' or 'Vercel Blob' */
  readonly label: string
  /** Directory or bucket the store writes to; null when it has none to show */
  readonly location: string | null
  /** Write an object under a new key */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile>
  /** Read an object; null when it does not exist */
  get(key: string): Promise<Uint8Array | null>
  /** Copy an object to a new key */
  copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile>
  /** Delete an object; no error when it is already gone */
  delete(key: string): Promise<void>
}

/**
 * Pluggable vault for the secrets a site stores in its database, such as a pasted
 * LLM key. Only the running system can open what it sealed: the database holds
 * the sealed value, and the key lives with the deployment (an environment
 * variable, or a cloud key service).
 */
export interface ISecretVault {
  /** Human-readable vault name, e.g. 'Local key' */
  readonly label: string
  /** Seal a secret under its setting name; the name is bound to the sealed value */
  seal(name: string, plaintext: string): Promise<string>
  /** Open a sealed value; null when it is not this vault's, was sealed under another name, or was tampered with */
  open(name: string, sealed: string): Promise<string | null>
}

// --- Page Cache ---
export type {
  IPageCacheStore,
  PageCacheEntry,
  PageCacheMarkOptions,
  PageCacheTagState,
  PageCacheValue,
} from './page-cache.js'
export {
  decodePageCacheValue,
  encodePageCacheValue,
  uniquePageCacheTags,
} from './page-cache.js'

// --- Site Settings ---

/** Pluggable runtime site settings adapter */
export interface ISiteSettingsAdapter {
  /** Get a setting value by key */
  getSetting(key: string): Promise<string | null>
  /** Set a setting value */
  setSetting(key: string, value: string): Promise<void>
  /** Get all settings as a map */
  getAllSettings(): Promise<Record<string, string>>
}

// --- SQL Utilities (shared across adapters) ---

/** Escape special LIKE pattern characters (%, _, \) for safe prefix matching. */
export function escapeSqlLikePattern(prefix: string): string {
  return prefix.replace(/[%_\\]/g, '\\$&')
}

// --- SEO Configuration ---

/** Scope of an SEO archetype configuration */
export type SeoConfigScope = 'site' | 'collection' | 'document' | 'route'

/** Stored SEO configuration for a site, collection, document, or route */
export interface SeoConfig {
  id: string
  scope: SeoConfigScope
  config: SeoConfigData
  createdAt: string
  updatedAt: string
}

export interface ISeoConfigAdapter {
  /** Get SEO config by ID (e.g., 'site', 'collection:pages', 'doc:pages/home') */
  getConfig(id: string): Promise<SeoConfig | null>
  /** Save SEO config (upsert) */
  saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void>
  /** Delete SEO config */
  deleteConfig(id: string): Promise<void>
  /** List all configs by scope */
  listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]>
  /** List configs matching an ID prefix (e.g., 'doc:pages/' for all page doc configs) */
  listConfigsByPrefix(prefix: string): Promise<SeoConfig[]>
  /** Delete all SEO configs in a single operation. Returns the number deleted. */
  deleteAllConfigs(): Promise<number>
}

// --- Version Retention ---

/** Result of a version purge operation */
export interface PurgeResult {
  collection: string
  slug: string
  purged: number
  retained: number
}

/** Pluggable version retention adapter */
export interface IRetentionAdapter {
  /** Purge old versions, keeping the N most recent per item */
  purgeVersions(maxVersionsPerItem: number): Promise<PurgeResult[]>
  /** Count total version rows across all content */
  countVersions(): Promise<{ total: number; current: number; historical: number }>
}

// --- Advisory Locking ---

/** Lock info for a content item */
export interface ContentLock {
  collection: string
  slug: string
  locale: string
  lockedBy: string
  lockedAt: string
  expiresAt: string
}

/** Pluggable advisory lock adapter */
export interface ILockAdapter {
  /** Get existing lock for a content item */
  getLock(collection: string, slug: string, locale: string): Promise<ContentLock | null>
  /** Acquire or renew a lock */
  acquireLock(
    collection: string,
    slug: string,
    locale: string,
    lockedBy: string,
    expiresAt: string,
  ): Promise<void>
  /** Release a lock */
  releaseLock(collection: string, slug: string, locale: string): Promise<void>
  /** Every unexpired lock, by collection, slug and locale */
  listLocks(): Promise<ContentLock[]>
}

// --- Webhook Delivery ---

/** A webhook delivery record */
export interface WebhookDeliveryRecord {
  id: number
  url: string
  event: string
  status: number | null
  attempts: number
  nextRetryAt: string | null
  createdAt: string
  deliveredAt: string | null
}

/** A delivery with the body it sends: what a retry sends again */
export interface StoredWebhookDelivery extends WebhookDeliveryRecord {
  payload: string
}

/** A first send to put in the log */
export interface NewWebhookDelivery {
  url: string
  event: string
  /** The JSON body that is sent */
  payload: string
  /** When the delivery is due for a retry, were this send to record no outcome */
  retryAt: Date
}

/** Maximum delivery attempts before a webhook is considered failed */
export const MAX_WEBHOOK_ATTEMPTS = 5

/** Pluggable webhook delivery adapter */
export interface IWebhookDeliveryAdapter {
  /** List deliveries with optional status filter */
  listDeliveries(options: {
    limit: number
    offset: number
    status?: 'pending' | 'delivered' | 'failed' | undefined
  }): Promise<{ deliveries: WebhookDeliveryRecord[]; total: number }>
  /** One delivery with its payload; null when none has the id */
  getDelivery(id: number): Promise<StoredWebhookDelivery | null>
  /**
   * Put a failed delivery back in the queue with one attempt left
   * (`MAX_WEBHOOK_ATTEMPTS - 1`), due at `dueAt`; null when no failed
   * delivery has the id — none does, or it was delivered, or it is still
   * pending
   */
  requeueDelivery(id: number, dueAt: Date): Promise<WebhookDeliveryRecord | null>
  /** Log a first send: one attempt made, no outcome yet. Returns the delivery's id */
  logDelivery(delivery: NewWebhookDelivery): Promise<number>
  /** Record that the webhook accepted the delivery, with its HTTP status */
  markDelivered(id: number, status: number): Promise<void>
  /**
   * Record a failed attempt: the status (0 when none came), one more attempt
   * counted, and the time the delivery is due for the next
   */
  markFailed(id: number, status: number, nextRetryAt: Date): Promise<void>
  /**
   * Claim the deliveries to send again at `now`, oldest first: not delivered,
   * with attempts left, no retry time or one that has passed, and sent to one
   * of `urls`. Each claimed delivery is due again only at `leaseUntil`, in the
   * same statement, so a sweep running at once elsewhere — another instance on
   * the same database — never claims it too
   */
  claimDueDeliveries(options: {
    urls: readonly string[]
    now: Date
    leaseUntil: Date
    limit: number
  }): Promise<StoredWebhookDelivery[]>
}

// --- Media Folders ---

/** A folder in the media library's hierarchical folder tree */
export interface MediaFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

/** Pluggable media folder storage */
export interface IMediaFolderStorage {
  /** List all folders as a flat array (caller builds tree) */
  listFolders(): Promise<MediaFolder[]>
  /** Create a folder */
  createFolder(name: string, parentId?: string | null): Promise<MediaFolder>
  /** Rename a folder */
  renameFolder(id: string, name: string): Promise<MediaFolder | null>
  /** Delete an empty folder */
  deleteFolder(id: string): Promise<void>
}

// --- Runtime Schema ---

/** Runtime field definition — stored in database, extends code-defined schemas */
export interface RuntimeFieldDefinition {
  name: string
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'enum'
    | 'url'
    | 'email'
    | 'textarea'
    | 'color'
    | 'reference'
  required: boolean
  default?: unknown | undefined
  description?: string | undefined
  enumValues?: string[] | undefined
  refCollection?: string | undefined
  /** Whether this field holds an array of values (for reference arrays) */
  isArray?: boolean | undefined
  min?: number | undefined
  max?: number | undefined
  pattern?: string | undefined
}

/** A complete, named metadata definition added by an administrator. */
export interface RuntimeMetadataGroup {
  slot: string
  id: string
  label: string
  required: boolean
  schema: Record<string, unknown>
}

/** Runtime schema for a collection — runtime fields that extend the code-defined schema */
export interface RuntimeSchemaDefinition {
  collection: string
  fields: RuntimeFieldDefinition[]
  metadata?: RuntimeMetadataGroup[] | undefined
  updatedAt: string
}

export type {
  RepositoryBasis,
  RepositoryDocument,
  RepositoryFileInput,
} from './repository-content.js'
export {
  contractReferenceMatches,
  repositoryDocument,
  repositoryFile,
  repositoryFrontmatter,
  repositoryMarkdown,
} from './repository-content.js'
