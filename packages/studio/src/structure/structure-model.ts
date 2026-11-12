import { hasValidStructuredData } from '../lib/findability.js'
import type { Loaded } from '../site/use-loaded.js'
import { richCards, richTotals } from './rich-results-model.js'
import {
  type Catalog,
  configOf,
  type SiteFindings,
  type StructureBase,
  siteOnlyTypes,
} from './structure-sources.js'

/**
 * The intro band's figures, each from its source: the live pages' findings
 * for valid graphs and eligible rich results, the site's SEO settings for its
 * entities. A figure whose source could not be read is null, never zero.
 */
export interface IntroFigures {
  graphs: { valid: number; pages: number } | null
  siteEntities: number | null
  rich: { eligible: number; applicable: number } | null
}

function siteEntityCount(base: StructureBase | null): number | null {
  if (base?.configs.state !== 'ok') return null
  return configOf(base.configs.value, 'site')?.config.entities.length ?? 0
}

export function introFigures(
  base: StructureBase | null,
  findings: Loaded<SiteFindings>,
): IntroFigures {
  const siteEntities = siteEntityCount(base)
  if (findings.state !== 'ready') return { graphs: null, siteEntities, rich: null }
  const { pages, readers } = findings.data
  const catalog = base?.catalog ?? ({ state: 'failed' } as const)
  const cards = richCards(pages, readers, siteOnlyTypes(catalog))
  return {
    graphs: { valid: pages.filter(hasValidStructuredData).length, pages: pages.length },
    siteEntities,
    rich: richTotals(cards),
  }
}

/** The catalog, when it was read */
export function catalogOf(base: StructureBase): Catalog | null {
  return base.catalog.state === 'ok' ? base.catalog.value : null
}
