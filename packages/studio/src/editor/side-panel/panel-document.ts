import type { AuthoredMetadata } from '@krantho/core'
import type {
  CollectionInfo,
  CollectionSchema,
  DocumentMeta,
  SeoLimits,
} from '../../lib/api-types.js'
import type { SiteLocales } from '../../lib/locales.js'
import type { Draft } from '../editor-model.js'
import type { LiveFound } from '../live-marks.js'

/** What the side panel reads of the open document, and the edits it may make */
export interface PanelDocument {
  collection: string
  /** The collection as `GET /api/collections` lists it — its pages and designed sections; null when unreadable */
  info: CollectionInfo | null
  schema: CollectionSchema
  /** The form's work, unsaved changes included */
  draft: Draft
  /** The saved version's meta; null until a new document is saved */
  meta: DocumentMeta | null
  /** The site's editorial limits for titles and meta descriptions; null when unreadable */
  limits: SeoLimits | null
  /** The site's locales (Setup › Locales); null when unreadable */
  locales: SiteLocales | null
  /** The form is read-only: the role cannot edit, someone else holds the lock, or it is being created */
  readOnly: boolean
  /** The viewer's role may edit documents */
  canEdit: boolean
  /** Whether SEO reads this document's fields: SEO is on and the document has a page */
  seoReadsFields: boolean
  /** What Live mode found marked on the page; null outside Live mode or before its scan */
  live: LiveFound | null
  onField: (name: string, value: unknown) => void
  defaults: AuthoredMetadata['defaults']
  fieldErrors: Readonly<Record<string, string>>
  onMetadata: (metadata: Draft['metadata']) => void
  onBody: (body: string) => void
}

/** The schema's field names: the fields Structure mode shows */
export function schemaFieldNames(schema: CollectionSchema): string[] {
  return Object.keys(schema.schema.properties ?? {})
}
