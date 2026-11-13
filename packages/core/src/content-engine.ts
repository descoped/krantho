/**
 * CMS Core Content Engine - UI-Agnostic Implementation
 *
 * Objective: Zero UI coupling, pure content management
 *
 * Critical Requirements:
 * - NO imports from @mui/material or any UI framework
 * - Pure content loading, processing, and caching
 * - Type safety with proper TypeScript generics
 * - Dependency injection for testability
 */

import matter from 'gray-matter'
import { marked } from 'marked'
import { splitFrontmatter } from './frontmatter-utils.js'
import { splitSections } from './sections.js'
import { TypeGuards } from './type-guards.js'
import type {
  CacheEntry,
  CacheStats,
  ContentEngineConfig,
  ContentError,
  ContentMetadata,
  ContentResult,
  IContentEngine,
  IContentLoader,
  IMarkdownProcessor,
  RenderedContent,
} from './types.js'
import { DEFAULT_CONFIG } from './types.js'

/** Create an empty ContentResult for error/fallback cases */
export function createEmptyResult(
  slug: string,
  error: ContentError | null,
  processingTime: number = 0,
): ContentResult {
  return {
    fields: {},
    content: '',
    html: '',
    sections: {},
    metadata: {
      slug,
      lastModified: new Date(),
      size: 0,
      processingTime,
    },
    loading: false,
    error,
  }
}

/** Options for {@link MarkdownProcessor} */
export interface MarkdownProcessorOptions {
  /**
   * The path a site is served under (`/docs-site`): a link or image whose
   * URL starts at the site's root (`/guide`, `/images/a.png`) gets it in
   * front, as the site's own links do. Empty or unset leaves URLs as written.
   * URLs in raw HTML inside the markdown are left as written.
   */
  basePath?: string | undefined
  /**
   * Rewrites the URL of each link and image as written in the markdown,
   * before the base path is added: a static site maps a relative link to
   * another document's file (`setup.md#install`) to that page's address.
   * URLs in raw HTML are left as written.
   */
  resolveUrl?: ((url: string) => string) | undefined
}

/** A path without the slashes it ends with: `/docs-site/` is `/docs-site` */
function withoutTrailingSlashes(path: string): string {
  let end = path.length
  while (end > 0 && path[end - 1] === '/') end--
  return path.slice(0, end)
}

/**
 * A root-relative URL (`/guide`, not `//host` or `https:`) under the base
 * path. A URL already under it — `/docs-site`, `/docs-site/guide`,
 * `/docs-site?q`, `/docs-site#top` — is left as written.
 */
function underBasePath(url: string, basePath: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url
  if (url.startsWith(basePath) && ['', '/', '?', '#'].includes(url.charAt(basePath.length))) {
    return url
  }
  return `${basePath}${url}`
}

/**
 * Markdown processor with @ notation support
 */
export class MarkdownProcessor implements IMarkdownProcessor {
  private readonly rewrite: ((url: string) => string) | undefined

  constructor(options: MarkdownProcessorOptions = {}) {
    const basePath = withoutTrailingSlashes(options.basePath ?? '')
    const resolve = options.resolveUrl
    if (basePath && resolve) this.rewrite = (url) => underBasePath(resolve(url), basePath)
    else if (basePath) this.rewrite = (url) => underBasePath(url, basePath)
    else this.rewrite = resolve
  }

  async parse(content: string): Promise<string> {
    const rewrite = this.rewrite
    try {
      const result = await marked.parse(
        content,
        rewrite
          ? {
              walkTokens: (token) => {
                if (token.type === 'link' || token.type === 'image') {
                  token.href = rewrite(token.href)
                }
              },
            }
          : undefined,
      )
      return typeof result === 'string' ? result : String(result)
    } catch (error) {
      throw new Error('Failed to parse markdown', { cause: error })
    }
  }

  /**
   * The rendered `##` sections of a body by heading (see `splitSections`). A
   * heading inside a code fence is not a section; when two sections share a
   * heading, the first is the one named by it.
   */
  async extractSections(content: string): Promise<Record<string, string>> {
    const sections = new Map<string, string>()
    for (const section of splitSections(content).sections) {
      if (sections.has(section.heading)) continue
      sections.set(section.heading, await this.parse(section.markdown))
    }
    return Object.fromEntries(sections)
  }

  processAtNotation(content: string, fields: Record<string, unknown>): string {
    return content.replace(/@([\w-]+)/g, (match, key) => {
      const value = fields[key]
      return value !== undefined ? String(value) : match
    })
  }
}

/** Options for {@link renderContent} */
export interface RenderContentOptions {
  /** Substitute `@field` references with field values (default true) */
  atNotation?: boolean | undefined
  processor?: IMarkdownProcessor | undefined
  /** The path the site is served under, for root-relative URLs ({@link MarkdownProcessorOptions}) */
  basePath?: string | undefined
  /** Rewrites link and image URLs before the base path is added ({@link MarkdownProcessorOptions}) */
  resolveUrl?: ((url: string) => string) | undefined
}

/**
 * Render a markdown body for display: @-notation substitution from `fields`,
 * HTML, and the h2 sections. The one implementation of content rendering —
 * the content engine uses it, and so do server-rendered pages reading
 * published content.
 */
export async function renderContent(
  fields: Record<string, unknown>,
  body: string,
  options: RenderContentOptions = {},
): Promise<RenderedContent> {
  const processor =
    options.processor ??
    new MarkdownProcessor({ basePath: options.basePath, resolveUrl: options.resolveUrl })
  const content = (options.atNotation ?? true) ? processor.processAtNotation(body, fields) : body
  const [html, sections] = await Promise.all([
    processor.parse(content),
    processor.extractSections(content),
  ])
  return { content, html, sections }
}

/**
 * Main content engine implementation
 */
export class ContentEngine implements IContentEngine {
  private cache: Map<string, CacheEntry> = new Map()
  private stats: CacheStats = {
    size: 0,
    hitRate: 0,
    totalRequests: 0,
    totalHits: 0,
    totalMisses: 0,
  }

  constructor(
    private config: ContentEngineConfig,
    private contentLoader: IContentLoader,
    private markdownProcessor: IMarkdownProcessor,
  ) {}

  async loadContent(slug: string): Promise<ContentResult> {
    const startTime = Date.now()
    this.stats.totalRequests++

    const cached = this.checkCache(slug)
    if (cached) return cached

    try {
      return await this.loadAndProcess(slug, startTime)
    } catch (error) {
      return this.handleLoadError(slug, error, startTime)
    }
  }

  private checkCache(slug: string): ContentResult | null {
    const cached = this.config.cacheEnabled ? this.getCachedContent(slug) : null
    if (cached) {
      this.stats.totalHits++
      this.updateHitRate()
      return cached
    }

    this.stats.totalMisses++
    this.updateHitRate()
    return null
  }

  private async loadAndProcess(slug: string, startTime: number): Promise<ContentResult> {
    if (!(await this.contentLoader.exists(slug))) {
      const error: ContentError = {
        code: 'NOT_FOUND',
        message: `Content not found for slug: ${slug}`,
        details: { slug },
      }
      return this.createErrorResult(slug, error, Date.now() - startTime)
    }

    const rawContent = await this.contentLoader.read(slug)
    const fileMetadata = await this.contentLoader.getMetadata(slug)
    const result = await this.processContent(slug, rawContent, fileMetadata, startTime)

    if (this.config.cacheEnabled) {
      this.setCachedContent(slug, result)
    }

    return result
  }

  private handleLoadError(slug: string, error: unknown, startTime: number): ContentResult {
    const contentError: ContentError = {
      code: 'PARSE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: { slug, error },
    }
    return this.createErrorResult(slug, contentError, Date.now() - startTime)
  }

  getConfig(): ContentEngineConfig {
    return { ...this.config }
  }

  clearCache(): void {
    this.cache.clear()
    this.stats.size = 0
  }

  getCacheStats(): CacheStats {
    return { ...this.stats }
  }

  private async processContent(
    slug: string,
    rawContent: string,
    fileMetadata: Pick<ContentMetadata, 'size' | 'lastModified'>,
    startTime: number,
  ): Promise<ContentResult> {
    // Parse YAML frontmatter — at the filesystem boundary, becomes `fields`
    const parsed = matter(rawContent)
    const fields = splitFrontmatter(parsed.data, '').fields
    const {
      content: processedContent,
      html,
      sections,
    } = await renderContent(fields, parsed.content, {
      atNotation: this.config.enableAtNotation,
      processor: this.markdownProcessor,
    })

    const metadata: ContentMetadata = {
      slug,
      lastModified: fileMetadata.lastModified,
      size: fileMetadata.size,
      processingTime: Date.now() - startTime,
    }

    return {
      fields,
      content: processedContent,
      html,
      sections,
      metadata,
      loading: false,
      error: null,
    }
  }

  private createErrorResult(
    slug: string,
    error: ContentError,
    processingTime: number,
  ): ContentResult {
    return createEmptyResult(slug, error, processingTime)
  }

  private getCachedContent(slug: string): ContentResult | null {
    const cacheKey = `content:${slug}`
    const cached = this.cache.get(cacheKey)

    if (!cached) return null

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(cacheKey)
      this.stats.size = this.cache.size
      return null
    }

    return cached.data
  }

  private setCachedContent(slug: string, content: ContentResult): void {
    const cacheKey = `content:${slug}`

    this.cache.set(cacheKey, {
      data: content,
      timestamp: Date.now(),
    })

    this.stats.size = this.cache.size
    this.cleanupCache()
  }

  private cleanupCache(): void {
    if (this.cache.size <= this.config.maxCacheSize) return

    // Remove oldest entries
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

    const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize)
    for (const [key] of toRemove) {
      this.cache.delete(key)
    }

    this.stats.size = this.cache.size
  }

  private updateHitRate(): void {
    this.stats.hitRate =
      this.stats.totalRequests > 0 ? this.stats.totalHits / this.stats.totalRequests : 0
  }
}

/**
 * Factory for creating content engines with dependency injection.
 * Core does not provide a default loader — consumers must supply one
 * (e.g., FileSystemAdapter from @krantho/persistence-fs).
 */
export class ContentEngineFactory {
  static create(
    contentLoader: IContentLoader,
    config: Partial<ContentEngineConfig> = {},
    markdownProcessor?: IMarkdownProcessor,
  ): IContentEngine {
    const finalConfig: ContentEngineConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    }

    const processor = markdownProcessor || new MarkdownProcessor()
    return new ContentEngine(finalConfig, contentLoader, processor)
  }
}

/**
 * Convenience functions for common operations
 */
export const ContentEngineUtils = {
  /**
   * Load content with error handling
   */
  async safeLoadContent(engine: IContentEngine, slug: string): Promise<ContentResult> {
    try {
      return await engine.loadContent(slug)
    } catch (error) {
      return createEmptyResult(slug, {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { slug, error },
      })
    }
  },

  /**
   * Validate content result
   */
  validateContentResult(result: unknown): result is ContentResult {
    return TypeGuards.isContentResult(result)
  },

  /**
   * Extract field value from content fields with type safety
   */
  extractField(fields: Record<string, unknown>, field: string): string {
    const value = fields[field]

    if (typeof value === 'string') {
      return value
    } else if (value != null) {
      return String(value)
    } else {
      return ''
    }
  },
}

// Classes and interfaces are exported via their declarations above
// No need for redundant exports
