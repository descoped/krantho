/**
 * Site configuration for SEO enrichment tools.
 *
 * Consuming projects provide a `content/seo/site-config.json` file
 * with site-specific values. This module loads it and provides defaults.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { toolPaths } from './tool-paths'

export interface SiteConfig {
  /** Site domain without protocol (e.g., 'example.com') */
  domain: string
  /** Site display name (e.g., 'Example Practice') */
  siteName: string
  /** Language for generated content (e.g., 'nb' for Norwegian, 'en' for English) */
  language: string
  /** Short site description for prompt context */
  siteDescription: string
  /** Service IDs for enrichment (e.g., ['strategy', 'digital-transformation', 'advisory']) */
  serviceIds: string[]
  /** Slug of the content file containing service sections */
  servicesSlug: string
  /** Map route paths to CMS content slugs (e.g., { '/': 'home', '/about': 'about-us' }) */
  routeToSlug: Record<string, string>
  /** Map route paths to section slugs within a content file (e.g., { '/services/strategy': 'strategy' }) */
  routeToSection: Record<string, string>
  /** Pages assembled from multiple CMS files, keyed by route (e.g., { '/': ['short-bio'] }) */
  pageCompositions: Record<string, string[]>
  /** Same as pageCompositions but keyed by slug instead of route (e.g., { 'home': ['short-bio'] }) */
  slugCompositions: Record<string, string[]>
  /** All known app routes for FAQ mapping (e.g., ['/', '/services', '/about']) */
  appRoutes: string[]
  /** Map service IDs to fee row numbers in fees.md (e.g., { 'strategy': 1 }) */
  serviceFeeMapping: Record<string, number>
  /** ISO 4217 currency code for pricing (e.g., 'USD', 'NOK') */
  priceCurrency: string
  /** ISO 3166-1 alpha-2 country code (e.g., 'US', 'NO') */
  addressCountry: string
  /** Map locale day names to English Schema.org names (e.g., { 'Monday': 'Monday', 'Mandag': 'Monday' }) */
  dayNameMapping: Record<string, string>
  /** Routes to skip during FAQ enrichment (e.g., ['/privacy', '/terms']) */
  enrichSkipRoutes: string[]
}

const ENGLISH_DAYS: Record<string, string> = {
  Monday: 'Monday',
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  Saturday: 'Saturday',
  Sunday: 'Sunday',
}

const DEFAULT_CONFIG: SiteConfig = {
  domain: 'example.com',
  siteName: 'Example Site',
  language: 'en',
  siteDescription: 'a website',
  serviceIds: [],
  servicesSlug: 'services',
  routeToSlug: {},
  routeToSection: {},
  pageCompositions: {},
  slugCompositions: {},
  appRoutes: [],
  serviceFeeMapping: {},
  priceCurrency: 'USD',
  addressCountry: 'US',
  dayNameMapping: ENGLISH_DAYS,
  enrichSkipRoutes: [],
}

let _cached: SiteConfig | null = null

/** Load site config from content/seo/site-config.json, falling back to defaults */
export function loadSiteConfig(): SiteConfig {
  if (_cached) return _cached

  const configPath = join(toolPaths().seoDir, 'site-config.json')

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SiteConfig>
    _cached = { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    console.warn(`Site config not found at ${configPath}, using defaults`)
    _cached = { ...DEFAULT_CONFIG }
  }

  return _cached
}
