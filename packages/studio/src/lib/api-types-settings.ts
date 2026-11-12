import type { SeoLimits } from './api-types-seo.js'

/** The site's public configuration — `PublicConfig` from `@krantho/config` — and its collections */
export interface SiteConfigResponse {
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
    /** Editorial limits every SEO check shares: editor, score, previews and the API */
    limits: SeoLimits
    /** Reader profiles findings are reported for */
    readers: string[]
  }
  /** How the site caches rendered pages, and whether its instances share the cache */
  cache: {
    pages: 'none' | 'next-isr' | 'cdn'
    shared: 'none' | 'database'
  }
  features: { media: boolean; localization: boolean }
  collections: Array<{
    name: string
    source: string
    fieldCount: number
  }>
}

export interface LocaleSettings {
  /** The configuration's `site.defaultLocale`; Setup does not change it */
  defaultLocale: string
  /** The locales the configuration lists: the ones Setup can switch on */
  configuredLocales: string[]
  /** The active locales: the configured ones, or the subset an admin chose */
  supportedLocales: string[]
  source: 'config' | 'database'
}

/** Where a provider's key comes from, in the words a person uses — never the key */
export type LLMKeySource = 'environment' | 'configuration' | 'saved'

/** One provider: whether it is on (it has a key), whether it is in use, and what it was given */
export interface LLMProviderStatus {
  provider: string
  ready: boolean
  active: boolean
  keySource: LLMKeySource | null
  /** The variable that sets the provider's key, for a developer; empty for a provider with none */
  env: string
  /** The model chosen for this provider; null for its default */
  model: string | null
  /** The base URL chosen for this provider; null for its own */
  baseUrl: string | null
}

export interface LLMSettings {
  /** A provider is on and in use */
  configured: boolean
  /** The provider in use */
  provider: string | null
  /** The model in use */
  model: string | null
  providers: LLMProviderStatus[]
  /** The configuration's `assistant.provider`: the provider the assistant uses instead of this one */
  assistantProvider: string | null
}

export interface LLMSettingsUpdate {
  provider: string
  model?: string | undefined
  apiKey?: string | undefined
  baseUrl?: string | undefined
  /** Make this the provider in use */
  use?: boolean | undefined
}

export interface LLMTestResult {
  success: boolean
  provider?: string | undefined
  model?: string | undefined
  usage?: { inputTokens: number; outputTokens: number } | undefined
  error?: string | undefined
}
