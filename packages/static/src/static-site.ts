import {
  buildDefaultRobotsBody,
  buildLlmsTxt,
  buildSitemapUrls,
  type SeoFileSource,
  serializeSitemapXml,
} from '@krantho/api'
import { type KranthoConfig, KranthoConfigError } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'
import { rendersPages } from '@krantho/core'
import { defineConfig } from '@krantho/schema'
import {
  type ContentLoader,
  contentVersion,
  createAdapter,
  createContentLoader,
  type KranthoHandlerOptions,
  memorySeoConfig,
} from '@krantho/server'
import { basePathOf } from './base-path.js'

/** The site a static build renders: its configuration and collections */
export type StaticSiteOptions = Pick<KranthoHandlerOptions, 'config' | 'collections'>

/** One page of a collection, as a static build lists it (Next's `generateStaticParams`) */
export interface StaticPageParams {
  slug: string
}

/** What a static build reads: the pages' content and SEO, the pages to write and the site's SEO files */
export interface StaticSite {
  /** The loader pages read through — pass it to `initServerLoader()` */
  readonly loader: ContentLoader
  /** The resolved configuration */
  readonly config: KranthoConfig
  /** The path the site is served under (`/docs-site`), or `''` at its host's root */
  readonly basePath: string
  /** Every published document of a collection, one page each */
  params(collection: string, locale?: string): Promise<StaticPageParams[]>
  /** sitemap.xml: every published, indexable page */
  sitemapXml(): Promise<string>
  /**
   * robots.txt, allowing every crawler and naming the sitemap. Crawlers read
   * robots.txt only at the host's root, so a site served under a path
   * (`/docs-site`) writes one that has no effect; submit its sitemap to the
   * search engines instead.
   */
  robotsTxt(): string
  /** llms.txt (llmstxt.org): the site and its published pages */
  llmsTxt(): Promise<string>
}

/**
 * A static site reads its markdown files and renders every page once, so
 * nothing is cached for it. Each page is written as a folder
 * (`docs/intro/index.html`, Next's `trailingSlash`), so each collection with
 * pages declares a path ending in `/`: the sitemap, llms.txt and the pages'
 * canonical URLs and JSON-LD then name the address the page is served at.
 */
function assertStatic(config: KranthoConfig, collections: StaticSiteOptions['collections']): void {
  const issues: string[] = []
  for (const [name, collection] of Object.entries(collections)) {
    const { path } = collection
    if (!rendersPages({ name, path }) || (typeof path === 'string' && path.endsWith('/'))) continue
    issues.push(
      `collection ${name} has path ${path ?? '(none)'}: a static site serves each page as a folder, so its path ends with / (\`/${name}/:slug/\`)`,
    )
  }
  if (config.persistence.provider !== 'filesystem') {
    issues.push(
      `persistence.provider is ${config.persistence.provider}: a static site reads its markdown files, so it must be filesystem`,
    )
  }
  if (config.cache.pages !== 'none') {
    issues.push(
      `cache.pages is ${config.cache.pages}: a static site is rendered once at build, so it must be none`,
    )
  }
  if (issues.length > 0) throw new KranthoConfigError(issues)
}

/** Say once when the content has no git history: its pages are then dated by when their files were written */
async function warnWithoutHistory(config: KranthoConfig): Promise<void> {
  if ((await contentVersion(config.paths.contentDir)) !== null) return
  console.warn(
    `[krantho] ${config.paths.contentDir} has no git history here, so pages are dated by their files' modification time. In CI, check out with fetch-depth: 0.`,
  )
}

async function openSeoFileSource(
  config: KranthoConfig,
  collections: StaticSiteOptions['collections'],
): Promise<SeoFileSource> {
  const contentConfig = defineConfig({ collections })
  const { adapter } = await createAdapter(
    config.persistence,
    config.site,
    config.content,
    contentConfig.collections,
  )
  return { config, contentConfig, adapter, seoConfigAdapter: await memorySeoConfig(config) }
}

/**
 * Create the site a static build renders: krantho on its markdown files,
 * with no database, no API and no Studio. Pages read through `loader` (the
 * live version of each document, with the structured SEO the `seo` section
 * configures), the build lists them with `params()`, and the sitemap,
 * robots.txt and llms.txt are written from the same content.
 *
 * Throws a `KranthoConfigError` unless `persistence.provider` is
 * `filesystem` and `cache.pages` is `none`. The site's address is
 * `site.baseUrl`; its path is the `basePath` the framework serves it under.
 */
export function createStaticSite(options: StaticSiteOptions): StaticSite {
  const config = loadConfig({ code: options.config, env: process.env })
  assertStatic(config, options.collections)
  const loader = createContentLoader(options)
  let source: Promise<SeoFileSource> | null = null
  let history: Promise<void> | null = null

  const files = (): Promise<SeoFileSource> => {
    history ??= warnWithoutHistory(config)
    source ??= openSeoFileSource(config, options.collections)
    return source
  }

  return {
    loader,
    config,
    basePath: basePathOf(config.site.baseUrl),
    params: async (collection, locale) => {
      if (!Object.hasOwn(options.collections, collection)) {
        throw new Error(`No collection named ${collection}`)
      }
      history ??= warnWithoutHistory(config)
      await history
      const summaries = await loader.listPublishedSummaries(collection, locale)
      return summaries.map((summary) => ({ slug: summary.slug }))
    },
    sitemapXml: async () => serializeSitemapXml(await buildSitemapUrls(await files())),
    robotsTxt: () => buildDefaultRobotsBody(config.site.baseUrl),
    llmsTxt: async () => buildLlmsTxt(await files()),
  }
}
