import type {
  ContentRef,
  IPublishedContentLoader,
  IPublishedSeoLoader,
  PublishedContent,
} from '@krantho/core'
import { NetworkError, renderContent } from '@krantho/core'
import type { CMSContent, CMSSummary, ContentLoaderOptions } from '../types'

/**
 * What server components read through: published content, and the pages' SEO
 * when the loader serves it (`createContentLoader()` does). Without SEO, the
 * resolvers fall back to content fields and render no JSON-LD.
 */
export type ServerContentLoader = IPublishedContentLoader & Partial<IPublishedSeoLoader>

let serverLoader: ServerContentLoader | null = null
let renderOptions: ServerLoaderOptions = {}

/** The document whose markdown a URL was written in */
export interface DocumentRef {
  collection: string
  slug: string
}

/** How server components render what they read */
export interface ServerLoaderOptions {
  /**
   * The path the site is served under (`/docs-site`, Next's `basePath`):
   * links and images in markdown that start at the site's root get it in
   * front, as the site's own links do
   */
  basePath?: string | undefined
  /**
   * Rewrites each link and image URL as written in a document's markdown,
   * before the base path is added — `createStaticSite()`'s `rendering.resolveUrl`
   * maps relative links between markdown files to the pages they become
   */
  resolveUrl?: ((url: string, document: DocumentRef) => string) | undefined
  /** Substitute `@field` references in the body with field values (default true) */
  atNotation?: boolean | undefined
}

/** The loader server components read through */
export function getServerLoader(): ServerContentLoader {
  if (!serverLoader) {
    throw new Error(
      'Server content loader not initialized. Call initServerLoader() with a content loader.',
    )
  }
  return serverLoader
}

/**
 * Set the loader server components read through — `createContentLoader()` from
 * `@krantho/server` (re-exported by the framework adapters). Pages read only
 * the live (published) version of each document.
 */
export function initServerLoader(
  loader: ServerContentLoader,
  options: ServerLoaderOptions = {},
): void {
  serverLoader = loader
  renderOptions = { ...options }
}

function generateExcerpt(
  sections: Record<string, string>,
  rawContent: string,
  length: number = 160,
): string {
  const sectionKeys = Object.keys(sections)
  const firstKey = sectionKeys[0]
  const firstSection = firstKey ? sections[firstKey] : undefined
  const source = firstSection ?? rawContent

  const plainText = source
    .replace(/<[^>]+>/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (plainText.length <= length) return plainText

  const truncated = plainText.substring(0, length)
  const lastSpace = truncated.lastIndexOf(' ')
  return truncated.substring(0, lastSpace) + '...'
}

async function toCMSContent(
  doc: PublishedContent,
  options: ContentLoaderOptions,
  preview: boolean,
): Promise<CMSContent> {
  const {
    processMarkdown = true,
    extractSections = true,
    generateExcerpt: shouldGenerateExcerpt = true,
    excerptLength = 160,
  } = options

  const { basePath, resolveUrl, atNotation } = renderOptions
  const document = { collection: doc.collection, slug: doc.slug }
  const rendered = await renderContent(doc.fields, doc.body, {
    basePath,
    atNotation,
    resolveUrl: resolveUrl && ((url) => resolveUrl(url, document)),
  })
  const sections = extractSections ? rendered.sections : {}

  return {
    collection: doc.collection,
    slug: doc.slug,
    locale: doc.locale,
    fields: doc.fields,
    html: processMarkdown ? rendered.html : rendered.content,
    rawContent: rendered.content,
    sections,
    excerpt: shouldGenerateExcerpt
      ? generateExcerpt(sections, rendered.content, excerptLength)
      : undefined,
    preview,
  }
}

function loadFailure(error: unknown): NetworkError {
  if (error instanceof NetworkError) return error
  return new NetworkError(
    error instanceof Error ? error.message : 'Unknown error during content loading',
    500,
  )
}

/**
 * Load the live version of a document. A document with no published version
 * — never published, unpublished or deleted — is a 404.
 */
export async function loadContent(
  ref: ContentRef,
  options: ContentLoaderOptions = {},
): Promise<CMSContent> {
  const loader = getServerLoader()
  try {
    const doc = await loader.getPublished(ref)
    if (!doc) {
      throw new NetworkError(`No published content: ${ref.collection}/${ref.slug}`, 404)
    }
    return await toCMSContent(doc, options, await loader.isPreview())
  } catch (error) {
    throw loadFailure(error)
  }
}

/** Load the live version of every published document in a collection */
export async function loadCollection(
  collection: string,
  locale?: string | undefined,
  options: ContentLoaderOptions = {},
): Promise<CMSContent[]> {
  const loader = getServerLoader()
  try {
    const [docs, preview] = await Promise.all([
      loader.listPublished(collection, locale),
      loader.isPreview(),
    ])
    return await Promise.all(docs.map((doc) => toCMSContent(doc, options, preview)))
  } catch (error) {
    throw loadFailure(error)
  }
}

/** Load the live version of every published document in a collection, without bodies: nothing is rendered */
export async function loadSummaries(
  collection: string,
  locale?: string | undefined,
): Promise<CMSSummary[]> {
  const loader = getServerLoader()
  try {
    const [docs, preview] = await Promise.all([
      loader.listPublishedSummaries(collection, locale),
      loader.isPreview(),
    ])
    return docs.map((doc) => ({
      collection: doc.collection,
      slug: doc.slug,
      locale: doc.locale,
      fields: doc.fields,
      preview,
    }))
  } catch (error) {
    throw loadFailure(error)
  }
}
