import type Database from 'better-sqlite3'

/** Row shape from the append-only content table */
export interface ContentRow {
  id: string
  collection: string
  slug: string
  locale: string
  version: number
  is_current: number
  status: string
  fields: string
  authored: string
  body: string
  html: string
  sections: string
  source: string
  file_path: string | null
  changed_by: string | null
  deleted_at: string | null
  created_at: string
  /** The document's live version as of this row; NULL when nothing is live */
  live_version: number | null
}

/** A content row read without its body, rendered HTML and sections */
export type SummaryRow = Omit<ContentRow, 'body' | 'html' | 'sections' | 'authored'> & {
  /** `authored.metadata` alone: the contract and provenance stay in the row */
  metadata: string | null
}

/** The columns of a content row that name a document: everything but its body, HTML and sections */
export const SUMMARY_COLUMNS =
  "id, collection, slug, locale, version, is_current, status, fields, json_extract(authored, '$.metadata') AS metadata, source, file_path, changed_by, deleted_at, created_at, live_version"

/** A content row read with neither its fields nor its body, rendered HTML and sections */
export type MetaRow = Omit<SummaryRow, 'fields' | 'metadata'>

/** The columns of a content row that make up a document's meta */
export const META_COLUMNS =
  'id, collection, slug, locale, version, is_current, status, source, file_path, changed_by, deleted_at, created_at, live_version'

/** Prepared statements for the append-only content table */
export interface PreparedStatements {
  getBySlug: Database.Statement<[string], ContentRow>
  getByCollectionSlugLocale: Database.Statement<[string, string, string], ContentRow>
  getPublished: Database.Statement<[string, string, string], ContentRow>
  getCurrentState: Database.Statement<
    [string, string, string],
    { live_version: number | null; status: string; authored: string }
  >
  existsBySlug: Database.Statement<[string], { count: number }>
  listAllSlugs: Database.Statement<[], { slug: string }>
  flipCurrent: Database.Statement<[string, string, string]>
  insertVersion: Database.Statement<
    [
      string,
      string,
      string,
      string,
      number,
      string,
      string,
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string,
      number | null,
      string,
    ]
  >
  getMaxVersion: Database.Statement<[string, string, string], { max_version: number | null }>
  listVersionMeta: Database.Statement<[string, string, string], MetaRow>
  getVersionByNumber: Database.Statement<[string, string, string, number], ContentRow>
}

export function prepareStatements(db: Database.Database): PreparedStatements {
  return {
    getBySlug: db.prepare<[string], ContentRow>(
      'SELECT * FROM content WHERE slug = ? AND is_current = 1 AND deleted_at IS NULL',
    ),
    getByCollectionSlugLocale: db.prepare<[string, string, string], ContentRow>(
      'SELECT * FROM content WHERE collection = ? AND slug = ? AND locale = ? AND is_current = 1 AND deleted_at IS NULL',
    ),
    getPublished: db.prepare<[string, string, string], ContentRow>(
      `SELECT live.* FROM content cur
       JOIN content live ON live.collection = cur.collection AND live.slug = cur.slug
         AND live.locale = cur.locale AND live.version = cur.live_version
       WHERE cur.collection = ? AND cur.slug = ? AND cur.locale = ?
         AND cur.is_current = 1 AND cur.deleted_at IS NULL`,
    ),
    getCurrentState: db.prepare<
      [string, string, string],
      { live_version: number | null; status: string; authored: string }
    >(
      'SELECT live_version, status, authored FROM content WHERE collection = ? AND slug = ? AND locale = ? AND is_current = 1',
    ),
    existsBySlug: db.prepare<[string], { count: number }>(
      'SELECT COUNT(*) as count FROM content WHERE slug = ? AND is_current = 1 AND deleted_at IS NULL',
    ),
    listAllSlugs: db.prepare<[], { slug: string }>(
      'SELECT DISTINCT slug FROM content WHERE is_current = 1 AND deleted_at IS NULL',
    ),
    flipCurrent: db.prepare(
      'UPDATE content SET is_current = 0 WHERE collection = ? AND slug = ? AND locale = ? AND is_current = 1',
    ),
    insertVersion: db.prepare(
      `INSERT INTO content (id, collection, slug, locale, version, status, fields, body, html, sections, source, file_path, changed_by, deleted_at, created_at, live_version, authored)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getMaxVersion: db.prepare<[string, string, string], { max_version: number | null }>(
      'SELECT MAX(version) as max_version FROM content WHERE collection = ? AND slug = ? AND locale = ?',
    ),
    listVersionMeta: db.prepare<[string, string, string], MetaRow>(
      `SELECT ${META_COLUMNS} FROM content WHERE collection = ? AND slug = ? AND locale = ? ORDER BY version DESC`,
    ),
    getVersionByNumber: db.prepare<[string, string, string, number], ContentRow>(
      'SELECT * FROM content WHERE collection = ? AND slug = ? AND locale = ? AND version = ?',
    ),
  }
}
