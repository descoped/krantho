import type { SqliteMigration } from '../migration-runner.js'

/**
 * V001: Initial schema — all core tables for content, schemas, manifests,
 * and checkpoints using the append-only versioning model.
 *
 * Content and collection_schemas use append-only rows with `is_current`
 * flags and `version` columns. Every write creates a new row.
 */
export const v001InitialSchema: SqliteMigration = {
  version: 1,
  name: 'initial_schema',
  apply: (db) => {
    // --- Content (append-only) ---

    db.exec(`
      CREATE TABLE content (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'en',
        version INTEGER NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        fields TEXT NOT NULL,
        body TEXT NOT NULL,
        html TEXT NOT NULL DEFAULT '',
        sections TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL DEFAULT 'api',
        file_path TEXT,
        changed_by TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(collection, slug, locale, version)
      )
    `)

    db.exec(
      'CREATE INDEX idx_content_current ON content(collection, slug, locale) WHERE is_current = 1',
    )
    db.exec(
      'CREATE INDEX idx_content_collection_status ON content(collection, status) WHERE is_current = 1',
    )
    db.exec('CREATE INDEX idx_content_slug ON content(slug) WHERE is_current = 1')

    // --- Collection schemas (append-only) ---

    db.exec(`
      CREATE TABLE collection_schemas (
        row_id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        fields TEXT NOT NULL,
        changed_by TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(collection, version)
      )
    `)

    db.exec(
      'CREATE INDEX idx_schemas_current ON collection_schemas(collection) WHERE is_current = 1',
    )

    // --- Content manifest ---

    db.exec(`
      CREATE TABLE content_manifest (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_version INTEGER NOT NULL,
        imported_at TEXT NOT NULL,
        file_checksums TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE content_migration_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_id INTEGER NOT NULL,
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        repo_checksum TEXT NOT NULL,
        db_checksum TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        resolved_at TEXT,
        resolution TEXT
      )
    `)

    db.exec(
      'CREATE INDEX idx_content_conflicts_unresolved ON content_migration_conflicts(resolved) WHERE resolved = 0',
    )

    // --- Checkpoints ---

    db.exec(`
      CREATE TABLE checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        name TEXT,
        trigger TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE checkpoint_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next INTEGER NOT NULL DEFAULT 1
      )
    `)

    db.exec('INSERT INTO checkpoint_counter (id, next) VALUES (1, 1)')
  },
}
