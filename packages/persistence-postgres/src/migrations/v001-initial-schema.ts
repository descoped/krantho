import type { PostgresMigration } from '../migration-runner.js'

/**
 * V001: Initial schema — all core tables in their final form.
 *
 * Content uses the append-only versioning model (version, is_current, deleted_at).
 * Collection schemas are append-only. Includes content manifest, migration
 * conflicts, and checkpoint tables.
 */
export const v001InitialSchema: PostgresMigration = {
  version: 1,
  name: 'initial_schema',
  apply: async (sql) => {
    // --- Content (append-only) ---

    await sql.unsafe(`
      CREATE TABLE content (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'en',
        version INTEGER NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'draft',
        fields JSONB NOT NULL,
        body TEXT NOT NULL,
        html TEXT NOT NULL DEFAULT '',
        sections JSONB NOT NULL DEFAULT '{}'::jsonb,
        source TEXT NOT NULL DEFAULT 'api',
        file_path TEXT,
        changed_by TEXT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(collection, slug, locale, version)
      )
    `)

    await sql.unsafe(
      'CREATE INDEX idx_content_current ON content(collection, slug, locale) WHERE is_current = TRUE',
    )
    await sql.unsafe(
      'CREATE INDEX idx_content_collection_status ON content(collection, status) WHERE is_current = TRUE',
    )
    await sql.unsafe('CREATE INDEX idx_content_slug ON content(slug) WHERE is_current = TRUE')

    // --- Collection schemas (append-only) ---

    await sql.unsafe(`
      CREATE TABLE collection_schemas (
        row_id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT TRUE,
        fields JSONB NOT NULL,
        changed_by TEXT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(collection, version)
      )
    `)

    await sql.unsafe(
      'CREATE INDEX idx_schemas_current ON collection_schemas(collection) WHERE is_current = TRUE',
    )

    // --- Content manifest ---

    await sql.unsafe(`
      CREATE TABLE content_manifest (
        id SERIAL PRIMARY KEY,
        repo_version INTEGER NOT NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        file_checksums JSONB NOT NULL
      )
    `)

    await sql.unsafe(`
      CREATE TABLE content_migration_conflicts (
        id SERIAL PRIMARY KEY,
        migration_id INTEGER NOT NULL,
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        repo_checksum TEXT NOT NULL,
        db_checksum TEXT NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMPTZ,
        resolution TEXT
      )
    `)

    await sql.unsafe(
      'CREATE INDEX idx_content_conflicts_unresolved ON content_migration_conflicts(resolved) WHERE resolved = FALSE',
    )

    // --- Checkpoints ---

    await sql.unsafe(`
      CREATE TABLE checkpoints (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        name TEXT,
        trigger TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`
      CREATE TABLE checkpoint_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next INTEGER NOT NULL DEFAULT 1
      )
    `)

    await sql.unsafe('INSERT INTO checkpoint_counter (id, next) VALUES (1, 1)')
  },
}
