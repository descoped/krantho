import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderContent, slugOfFile } from '@krantho/core'
import { type AuthoredMetadata, type Publication, publicationOfFile } from '@krantho/persistence'
import {
  type ContentConfig,
  parseRepositoryContent,
  resolveCollectionContract,
} from '@krantho/schema'
import matter from 'gray-matter'
import type { ContentDateOf } from './content-dates.js'

export interface ImportableAdapter {
  listSlugs(): Promise<string[]>
  getRuntimeSchema?(
    collection: string,
  ): Promise<import('@krantho/persistence').RuntimeSchemaDefinition | null>
  getContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<import('@krantho/persistence').ContentDocument | null>
  upsertFromFile(
    collection: string,
    slug: string,
    fields: Record<string, unknown>,
    body: string,
    html: string,
    sections: Record<string, string>,
    filePath: string,
    locale?: string | undefined,
    modifiedAt?: string | undefined,
    authored?:
      | (Partial<AuthoredMetadata> & {
          publication: Publication | undefined
          expectedVersion?: number | undefined
        })
      | undefined,
  ): Promise<void>
  /** Explicit document deletion; repository removal never invokes this method. */
  deleteContent?(
    collection: string,
    slug: string,
    locale?: string | undefined,
    changedBy?: string | undefined,
  ): Promise<void>
}

/**
 * Import .md files from content directories into the database.
 *
 * Reads collection directories from ContentConfig, parses each .md file,
 * and upserts into the database via the adapter. Skips import if the
 * database already has content. `dateOf` dates each imported version by when
 * its file last changed (see `generateContentDates`); without a date the
 * version is dated now.
 */
export async function autoImport(
  adapter: ImportableAdapter,
  contentConfig: ContentConfig,
  dateOf: ContentDateOf = () => undefined,
  defaultStatus: string = 'published',
): Promise<number> {
  // Skip if database already has content
  const existing = await adapter.listSlugs()
  if (existing.length > 0) return 0

  let imported = 0

  for (const [, collection] of contentConfig.collections) {
    if (!collection.directory) continue

    let entries: string[]
    try {
      entries = await readdir(collection.directory)
    } catch {
      // A missing directory is usually content left out of a deployment bundle
      console.warn(
        `[import] Skipping ${collection.name}: directory not found: ${collection.directory}`,
      )
      continue
    }

    const contract = resolveCollectionContract(
      collection,
      (await adapter.getRuntimeSchema?.(collection.name)) ?? null,
    )
    for (const file of entries) {
      const slug = slugOfFile(collection, file)
      if (slug === null) continue
      const filePath = join(collection.directory, file)

      try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = matter(raw)
        // At the filesystem boundary: YAML frontmatter becomes fields
        const fields = parsed.data as Record<string, unknown>

        // Validate fields against collection schema
        const result = parseRepositoryContent(
          collection,
          slug,
          fields,
          parsed.content,
          collection.schema,
          contract,
        )
        if (!result.success) {
          console.warn(`[import] Skipping ${collection.name}/${slug}: schema validation failed`)
          for (const issue of result.error.issues) {
            console.warn(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          }
          continue
        }

        const body = parsed.content
        const { html, sections } = await renderContent(result.data.fields, body, {
          atNotation: false,
        })

        await adapter.upsertFromFile(
          collection.name,
          slug,
          result.data.fields,
          body,
          html,
          sections,
          filePath,
          result.data.locale,
          dateOf(filePath),
          {
            ...result.data,
            publication: publicationOfFile(
              typeof fields.status === 'string' ? fields.status : defaultStatus,
            ),
            expectedVersion: 0,
          },
        )

        imported++
      } catch (err: unknown) {
        console.warn(`[import] Failed to parse ${file}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return imported
}
