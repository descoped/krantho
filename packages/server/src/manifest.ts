import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentManifest } from '@krantho/persistence'
import { contentDateKey } from './content-dates.js'

/** The file in the content directory that versions the repository's content */
export const CONTENT_MANIFEST_FILE = 'manifest.json'

/**
 * Write `<contentDir>/manifest.json`: the content's version and each markdown
 * file's SHA-256, keyed by its path relative to the content directory, and the git commit the
 * build ran at when it is known: the baseline a pull of production's edits starts from.
 *
 * Run at build time. A deployment whose manifest version is higher than the
 * database's imports the repository's new and changed files on startup (see
 * `runContentMigration`), so the version must grow with every content change —
 * `contentVersion` derives one from git.
 */
export async function generateManifest(
  contentDir: string,
  version: number,
  commit?: string | undefined,
): Promise<ContentManifest> {
  const files: ContentManifest['files'] = {}
  const entries = await readdir(contentDir, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const filePath = join(entry.parentPath, entry.name)
    const content = await readFile(filePath, 'utf-8')
    files[contentDateKey(contentDir, filePath)] = {
      checksum: createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content, 'utf-8'),
    }
  }

  const manifest: ContentManifest = {
    version,
    ...(commit === undefined ? {} : { commit }),
    generatedAt: new Date().toISOString(),
    files,
  }
  await writeFile(
    join(contentDir, CONTENT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf-8',
  )
  return manifest
}
