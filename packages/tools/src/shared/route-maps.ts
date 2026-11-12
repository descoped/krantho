/**
 * Shared route-to-CMS mappings for enrichment tools.
 *
 * Single source of truth for:
 *   - Route → CMS slug resolution
 *   - Route → section slug resolution (for service sections)
 *   - Page composition sources (pages assembled from multiple CMS files)
 *
 * All values are loaded from site-config.json via `loadSiteConfig()`.
 */

import { loadSiteConfig } from './site-config'

/** Get route-to-slug mapping from site config */
export function getRouteToSlug(): Record<string, string> {
  return loadSiteConfig().routeToSlug
}

/** Get route-to-section mapping from site config */
export function getRouteToSection(): Record<string, string> {
  return loadSiteConfig().routeToSection
}

/** Get page compositions (keyed by route) from site config */
export function getPageCompositions(): Record<string, string[]> {
  return loadSiteConfig().pageCompositions
}

/** Get slug compositions (keyed by slug) from site config */
export function getSlugCompositions(): Record<string, string[]> {
  return loadSiteConfig().slugCompositions
}
