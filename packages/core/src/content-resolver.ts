import { stat as fsStat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { marked } from 'marked'
import { type AuthoredMetadata, authoredMetadata } from './content-contract.js'
import { splitFrontmatter } from './frontmatter-utils.js'

/**
 * Lightweight content document for Tier 1 (filesystem-only) usage.
 *
 * Uses the same shape as ContentDocument from @krantho/persistence
 * but without persistence dependencies. This enables:
 *
 *   const content = createContentResolver(config)
 *   const page = await content.get('pages', 'about')
 *
 * No server, no API, no database required.
 */
export interface ResolvedDocument extends AuthoredMetadata {
  meta: {
    collection: string
    slug: string
    locale: string
    version: 1
    status: string
    source: 'filesystem'
    changedBy: null
    createdAt: string
  }
  fields: Record<string, unknown>
  body: string
  html: string
  sections: Record<string, string>
}

/** Collection configuration accepted by the resolver */
interface ResolverCollection {
  name: string
  parseDocument?:
    | ((
        slug: string,
        data: Record<string, unknown>,
        body: string,
      ) => {
        success: boolean
        data?: AuthoredMetadata & { fields: Record<string, unknown> }
        error?: { issues: Array<{ path: PropertyKey[]; message: string }> }
      })
    | undefined
  directory?: string | undefined
  schema?:
    | {
        safeParse: (data: unknown) => {
          success: boolean
          data?: unknown
          error?: { issues: Array<{ path: PropertyKey[]; message: string }> }
        }
      }
    | undefined
}

/** Content config accepted by the resolver */
interface ResolverConfig {
  collections: Map<string, ResolverCollection> | ReadonlyMap<string, ResolverCollection>
}

/** Options for creating a resolver */
interface ResolverOptions {
  /** Locale of a file whose frontmatter declares none: the site's default locale */
  defaultLocale: string
}

/** Options for listing content */
interface ListOptions {
  status?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

/** The Tier 1 content resolver — filesystem reads with optional schema validation */
export interface ContentResolver {
  /** Get a single content document by collection and slug */
  get(collection: string, slug: string): Promise<ResolvedDocument | null>
  /** List all content in a collection */
  list(collection: string, options?: ListOptions): Promise<ResolvedDocument[]>
}

async function loadDocument(
  filePath: string,
  collection: string,
  slug: string,
  defaultLocale: string,
  definition?: ResolverCollection,
): Promise<ResolvedDocument | null> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  const parsed = matter(raw)
  const data = parsed.data as Record<string, unknown>

  const system = splitFrontmatter(data, defaultLocale)
  const validated = definition?.parseDocument?.(slug, data, parsed.content)
  if (validated && !validated.success) return null
  // A raw resolver can validate fields without a complete registered contract.
  const schema = definition?.schema
  if (!validated && schema) {
    const result = schema.safeParse(system.fields)
    if (!result.success) {
      const issues = result.error?.issues ?? []
      console.warn(
        `[resolver] Validation failed for ${collection}/${slug}:`,
        issues.map((i) => `${i.path.join('.')} ${i.message}`),
      )
      return null
    }
  }

  const stat = await fsStat(filePath)
  const { fields, status, locale } = splitFrontmatter(data, defaultLocale)
  const html = await marked(parsed.content)
  const sections = extractH2Sections(html)

  return {
    meta: {
      collection,
      slug,
      locale,
      version: 1,
      status,
      source: 'filesystem',
      changedBy: null,
      createdAt: stat.mtime.toISOString(),
    },
    ...authoredMetadata(validated?.data ?? {}),
    fields: validated?.data?.fields ?? fields,
    body: parsed.content,
    html,
    sections,
  }
}

/** Extract h2 sections from rendered HTML */
function extractH2Sections(html: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = html.split(/<h2[^>]*>(.*?)<\/h2>/i)
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i]?.replace(/<[^>]+>/g, '').trim()
    const content = parts[i + 1]?.trim() ?? ''
    if (name) {
      sections[name] = content
    }
  }
  return sections
}

/**
 * Create a Tier 1 content resolver.
 *
 * Reads markdown files from the filesystem, parses YAML frontmatter,
 * validates against Zod schemas (if provided), and returns ContentDocument-shaped results.
 *
 * No server, no API, no database. Works in Next.js page.tsx, SvelteKit +page.server.ts,
 * or any Node.js context.
 *
 * @example
 * ```ts
 * import { createContentResolver } from '@krantho/core'
 * import { defineCollection, defineConfig } from '@krantho/schema'
 * import { z } from 'zod'
 *
 * const pages = defineCollection({
 *   name: 'pages',
 *   source: 'filesystem',
 *   directory: 'content/pages',
 *   schema: z.object({ title: z.string() }),
 * })
 *
 * const config = defineConfig({ collections: { pages } })
 * const content = createContentResolver(config, { defaultLocale: 'en' })
 *
 * const about = await content.get('pages', 'about')
 * ```
 */
export function createContentResolver(
  config: ResolverConfig,
  options: ResolverOptions,
): ContentResolver {
  return {
    async get(collection: string, slug: string): Promise<ResolvedDocument | null> {
      const col = config.collections.get(collection)
      if (!col?.directory) return null

      const filePath = join(col.directory, `${slug}.md`)
      return loadDocument(filePath, collection, slug, options.defaultLocale, col)
    },

    async list(collection: string, listOptions?: ListOptions): Promise<ResolvedDocument[]> {
      const col = config.collections.get(collection)
      if (!col?.directory) return []

      let entries: string[]
      try {
        entries = await readdir(col.directory)
      } catch {
        return []
      }

      const mdFiles = entries.filter((e) => e.endsWith('.md'))
      const results: ResolvedDocument[] = []

      for (const file of mdFiles) {
        const slug = file.slice(0, -3)
        const filePath = join(col.directory, file)
        const doc = await loadDocument(filePath, collection, slug, options.defaultLocale, col)
        if (!doc) continue

        if (listOptions?.status && doc.meta.status !== listOptions.status) continue

        results.push(doc)
      }

      const start = listOptions?.offset ?? 0
      const end = listOptions?.limit !== undefined ? start + listOptions.limit : undefined
      return results.slice(start, end)
    },
  }
}
