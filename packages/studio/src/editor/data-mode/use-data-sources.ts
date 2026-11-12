import { useCallback, useEffect, useRef } from 'react'
import {
  fetchCatalogType,
  fetchSeoCatalog,
  fetchSeoConfig,
  fetchSeoFindings,
  fetchSeoPreview,
  fetchSeoResolved,
  type SeoReader,
} from '../../lib/api.js'
import type { SeoFinding } from '../../lib/api-assistant.js'
import { ApiError } from '../../lib/api-client.js'
import type {
  CatalogDetailResponse,
  CatalogType,
  ResolvedEntity,
  SeoConfigData,
} from '../../lib/api-types.js'
import { type GraphModel, parseGraph } from '../../lib/jsonld-graph.js'
import { type Loaded, useLoaded } from '../../site/use-loaded.js'
import { loadRichResults, type RichResults } from '../rich-results.js'
import {
  type EmittedNode,
  editableConfig,
  emittedNodes,
  emittedTypes,
  type ScopeConfigs,
} from './graph-config.js'

/** The saved document Data mode reads: one locale version, read again when its version changes */
export interface DataTarget {
  collection: string
  slug: string
  locale: string
  version: number
  live: boolean
  defaultLocale: boolean
}

export interface DocumentFindings {
  findings: SeoFinding[]
  readers: SeoReader[]
}

/** The graph the page emits, and what its editor needs to edit it at the document scope */
export interface GraphSource {
  /** The JSON-LD as composed for the page */
  emitted: unknown
  nodes: EmittedNode[]
  model: GraphModel
  /** The document's configuration with an entity per emitted node */
  editable: SeoConfigData
  configs: ScopeConfigs
  catalogTypes: readonly CatalogType[]
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>
}

export interface DataSources {
  resolved: Loaded<ResolvedEntity[]>
  findings: Loaded<DocumentFindings>
  rich: Loaded<RichResults>
  graph: Loaded<GraphSource>
}

export async function configOf(id: string): Promise<SeoConfigData | null> {
  try {
    return (await fetchSeoConfig(id)).config?.config ?? null
  } catch (err: unknown) {
    // A site without SEO settings has none to read; a failed read is never taken for none
    if (err instanceof ApiError && err.status === 501) return null
    throw err
  }
}

/** The catalog's details of each type, those that answer */
async function catalogDetails(
  types: readonly string[],
): Promise<Map<string, CatalogDetailResponse>> {
  const settled = await Promise.allSettled(types.map(fetchCatalogType))
  const details = new Map<string, CatalogDetailResponse>()
  for (const result of settled) {
    if (result.status === 'fulfilled') details.set(result.value.type.type, result.value)
  }
  return details
}

async function loadGraph(collection: string, slug: string, locale: string): Promise<GraphSource> {
  const [emitted, document, collectionConfig, site, catalog] = await Promise.all([
    fetchSeoPreview(collection, slug, locale),
    configOf(`doc:${collection}/${slug}`),
    configOf(`collection:${collection}`),
    configOf('site'),
    fetchSeoCatalog().catch(() => ({ types: [] as CatalogType[] })),
  ])
  const nodes = emittedNodes(emitted)
  const configs = { document, collection: collectionConfig, site }
  return {
    emitted,
    nodes,
    model: parseGraph(emitted),
    editable: editableConfig(nodes, configs),
    configs,
    catalogTypes: catalog.types,
    catalogDetails: await catalogDetails(emittedTypes(nodes)),
  }
}

/**
 * A source read when its target changes, and again — keeping what is on
 * screen until the new answer arrives — when `revision` moves on
 */
function useSource<T>(load: () => Promise<T>, failure: string, revision: string): Loaded<T> {
  const { loaded, reload } = useLoaded(load, failure)
  const seen = useRef(revision)
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    reload()
  }, [revision, reload])
  return loaded
}

/**
 * Everything Data mode reads about the saved document's structured data:
 * its resolved values (`/api/seo/resolved`), its findings per reader
 * (`/api/seo/findings/:c/:s`), the live page's rich results, and the
 * composed graph with what its editor needs (`/api/seo/preview`, the
 * document's, collection's and site's SEO settings, the catalog)
 */
export function useDataSources(target: DataTarget, revision: number): DataSources {
  const { collection, slug, locale, live, defaultLocale } = target
  const resolved = useCallback(
    () => fetchSeoResolved(collection, slug, locale).then((r) => r.entities),
    [collection, slug, locale],
  )
  const findings = useCallback(
    () => fetchSeoFindings(collection, slug, locale),
    [collection, slug, locale],
  )
  const rich = useCallback(
    () => loadRichResults({ collection, slug, live, defaultLocale }),
    [collection, slug, live, defaultLocale],
  )
  const graph = useCallback(() => loadGraph(collection, slug, locale), [collection, slug, locale])
  // A new saved version, or a change to the SEO settings (`revision`), reads them again
  const key = `${target.version}:${revision}`
  return {
    resolved: useSource(resolved, 'The structured data could not be read', key),
    findings: useSource(findings, 'The findings could not be read', key),
    rich: useSource(rich, 'The rich results could not be read', key),
    graph: useSource(graph, 'The emitted graph could not be read', key),
  }
}
