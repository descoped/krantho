import type { ZodError, ZodObject, ZodRawShape, z } from 'zod'
import { type DocumentArchetype, defineDocumentArchetype } from './archetypes.js'
import { type ParsedRepositoryContent, parseRepositoryContent } from './repository-content.js'

/**
 * Configuration for a content collection.
 *
 * @typeParam T - Zod object schema describing content fields
 */
export interface CollectionConfig<T extends ZodObject<ZodRawShape>> {
  /** Unique collection name — used as namespace for slugs */
  name: string
  /** Where the content is mastered */
  source: 'filesystem' | 'database'
  /** Directory path for filesystem-mastered collections (relative to project root) */
  directory?: string | undefined
  /** Zod schema for fields validation and type inference */
  schema?: T | undefined
  /** Explicit reusable contract; use schema for an inline collection contract. */
  archetype?: DocumentArchetype<T> | undefined
  /**
   * Where the collection's documents render as pages — read by the sitemap,
   * **Preview on site**, page refresh and JSON-LD through `documentPath()` in
   * `@krantho/core`. A pattern holding `:slug` (`'/deploy/:slug'`; the slug
   * `index` renders at `'/deploy'`), a fixed path every document renders at
   * (`'/'` for a landing singleton), or `false` when the documents have no page
   * of their own. Unset: `pages` at the site root (`home` at `/`), `globals`
   * without pages, any other collection at `/<name>/<slug>`.
   */
  path?: string | false | undefined
  /**
   * The `##` sections the collection's page template designs, in order — the
   * template gives each its own treatment, renders other sections as prose and
   * leaves missing ones out. Studio shows editors which ones a document has.
   */
  sections?: readonly string[] | undefined
}

/**
 * A defined content collection with typed fields.
 *
 * @typeParam T - Zod object schema for this collection's fields
 */
export interface Collection<T extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>> {
  readonly name: string
  readonly source: 'filesystem' | 'database'
  readonly directory: string | undefined
  readonly schema: T
  readonly archetype: DocumentArchetype<T>
  readonly parseDocument: (
    slug: string,
    frontmatter: Record<string, unknown>,
    body: string,
  ) => { success: true; data: ParsedRepositoryContent } | { success: false; error: ZodError }
  /** Where the documents render as pages; `undefined` when not declared */
  readonly path: string | false | undefined
  /** The `##` sections the page template designs, in order; empty when it designs none */
  readonly sections: readonly string[]
  /** Inferred TypeScript type for validated fields (phantom — never assigned at runtime) */
  readonly _fields: z.infer<T>
}

/** The designed sections, checked: each a non-empty heading, none repeated (case aside) */
function designedSections(collection: string, sections: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  for (const section of sections) {
    const key = section.trim().toLowerCase()
    if (!key) throw new Error(`Collection "${collection}" has an empty section name`)
    if (seen.has(key))
      throw new Error(`Collection "${collection}" lists section "${section}" twice`)
    seen.add(key)
  }
  return sections.map((section) => section.trim())
}

/**
 * Define a content collection with a Zod schema for fields validation.
 *
 * @example
 * ```ts
 * const pages = defineCollection({
 *   name: 'pages',
 *   source: 'filesystem',
 *   directory: 'content/pages',
 *   schema: z.object({
 *     title: z.string(),
 *   }),
 * })
 * ```
 */
export function defineCollection<T extends ZodObject<ZodRawShape>>(
  config: CollectionConfig<T>,
): Collection<T> {
  if (!config.name) {
    throw new Error('Collection name is required')
  }

  if (config.source === 'filesystem' && !config.directory) {
    throw new Error(
      `Collection "${config.name}" with source "filesystem" requires a "directory" property`,
    )
  }

  if (typeof config.path === 'string' && !config.path.startsWith('/')) {
    throw new Error(`Collection "${config.name}" path "${config.path}" must start with "/"`)
  }

  if (Boolean(config.schema) === Boolean(config.archetype)) {
    throw new Error('A collection requires either schema or archetype')
  }
  const archetype =
    config.archetype ??
    defineDocumentArchetype({
      id: `collection/${config.name}`,
      label: config.name,
      fields: config.schema as T,
      sections: designedSections(config.name, config.sections ?? []),
    })
  const collection: Collection<T> = {
    name: config.name,
    source: config.source,
    directory: config.directory,
    schema: archetype.fields,
    archetype,
    parseDocument: (slug, frontmatter, body) =>
      parseRepositoryContent(collection, slug, frontmatter, body),
    path: config.path,
    sections: designedSections(config.name, config.sections ?? archetype.sections),
    // Phantom type — never used at runtime, only for type inference
    _fields: undefined as unknown as z.infer<T>,
  }
  return collection
}
