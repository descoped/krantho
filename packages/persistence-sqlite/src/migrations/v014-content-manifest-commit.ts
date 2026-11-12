import type { SqliteMigration } from '../migration-runner.js'

/**
 * V014: the git commit each content import came from. `content_manifest.repo_commit` is NULL
 * for an import whose build did not record one.
 */
export const v014ContentManifestCommit: SqliteMigration = {
  version: 14,
  name: 'content_manifest_commit',
  apply: (db) => {
    db.exec('ALTER TABLE content_manifest ADD COLUMN repo_commit TEXT')
  },
}
