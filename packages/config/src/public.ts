/**
 * The browser-safe half of the package, published as `@krantho/config/public`.
 *
 * Nothing here — or in anything it imports — may reach for a Node built-in, so
 * a client bundle can import it without pulling in the resolver.
 */

import { SECRET_PATHS } from './leaves.js'
import { getPath, setPath } from './object-path.js'
import type {
  KranthoConfig,
  KranthoConfigTree,
  PageCacheStrategy,
  SharedCacheStrategy,
  WebhookTarget,
} from './types.js'

/** Placeholder written where a secret's value would be */
export const REDACTED = '[redacted]'

/**
 * The only configuration a browser may see.
 *
 * Built by naming each field, so a leaf added to the tree can never reach a
 * page by accident — least of all a secret one.
 */
export interface PublicConfig {
  site: {
    domain: string
    name: string
    language: string
    baseUrl: string
    supportedLocales: string[]
    defaultLocale: string
    logo?: string | undefined
    description?: string | undefined
    alternateName?: string | undefined
    sameAs: string[]
  }
  seo: {
    /** Editorial limits every SEO check shares: Studio's editor, score and previews, and the API */
    limits: {
      metaDescription: { minChars: number; maxChars: number }
      title: { maxChars: number }
    }
    /** Reader profiles findings are reported for */
    readers: string[]
  }
  /** How the site caches rendered pages: the strategy, and whether its instances share the cache */
  cache: {
    pages: PageCacheStrategy
    shared: SharedCacheStrategy
  }
  features: {
    media: boolean
    localization: boolean
  }
}

/** Project the resolved tree down to what is safe to serialize into a page */
export function toPublicConfig(config: KranthoConfigTree): PublicConfig {
  return {
    site: {
      domain: config.site.domain,
      name: config.site.name,
      language: config.site.language,
      baseUrl: config.site.baseUrl,
      supportedLocales: [...config.site.supportedLocales],
      defaultLocale: config.site.defaultLocale,
      ...(config.site.logo ? { logo: config.site.logo } : {}),
      ...(config.site.description ? { description: config.site.description } : {}),
      ...(config.site.alternateName ? { alternateName: config.site.alternateName } : {}),
      sameAs: [...config.site.sameAs],
    },
    seo: {
      limits: {
        metaDescription: {
          minChars: config.seo.enrichment.meta.minChars,
          maxChars: config.seo.enrichment.meta.maxChars,
        },
        title: { maxChars: config.seo.enrichment.title.maxChars },
      },
      readers: [...config.seo.readers],
    },
    cache: {
      pages: config.cache.pages,
      shared: config.cache.shared,
    },
    features: {
      media: config.media.provider !== undefined,
      localization: config.site.supportedLocales.length > 1,
    },
  }
}

/**
 * The whole tree with every secret replaced by {@link REDACTED} and the
 * resolution metadata dropped — safe to log or to return to an authenticated
 * operator, never to an anonymous browser.
 */
export function redact(config: KranthoConfig | KranthoConfigTree): Record<string, unknown> {
  const { sources: _sources, ...tree } = config as KranthoConfig
  const clone = structuredClone(tree) as Record<string, unknown>

  for (const path of SECRET_PATHS) {
    if (getPath(clone, path) !== undefined) setPath(clone, path, REDACTED)
  }
  // A webhook's secret sits inside a list, which no dotted path reaches
  for (const hook of clone.webhooks as WebhookTarget[]) {
    if (hook.secret !== undefined) hook.secret = REDACTED
  }

  return clone
}
