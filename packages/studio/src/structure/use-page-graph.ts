import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { fetchSeoResolved, type PageSeoSummary, type SeoConfig } from '../lib/api.js'
import { fetchServed, servedFailure, servedOk } from '../lib/served.js'
import { type Loaded, useLoaded } from '../site/use-loaded.js'
import { type PageGraph, pageGraph, pageScopes } from './graph-model.js'
import { type ServedGraph, servedGraph } from './served-graph.js'

/** A live page's graph as served, or why it could not be read as served */
export type PageGraphRead =
  | { state: 'served'; served: ServedGraph; graph: PageGraph }
  | { state: 'unserved'; reason: string }

export interface PageGraphTarget {
  page: PageSeoSummary
  configs: readonly SeoConfig[]
  siteTypes: ReadonlySet<string>
}

/**
 * Read the page as the site serves it and take its JSON-LD; join each node
 * by `@id` to `GET /api/seo/resolved` for the source of each value (the
 * document's saved version, in the default locale), and to the page's
 * findings for its rich results
 */
async function readPageGraph(target: PageGraphTarget): Promise<PageGraphRead> {
  const { page } = target
  const [served, resolved] = await Promise.all([
    fetchServed(page.path),
    fetchSeoResolved(page.collection, page.slug),
  ])
  if (!servedOk(served)) return { state: 'unserved', reason: servedFailure(served) }
  const graph = servedGraph(served.text)
  if (graph.nodes.length === 0) {
    return { state: 'unserved', reason: `The page at ${page.path} serves no JSON-LD.` }
  }
  return {
    state: 'served',
    served: graph,
    graph: pageGraph({
      nodes: graph.nodes,
      resolved: resolved.entities,
      siteTypes: target.siteTypes,
      scopes: pageScopes(target.configs, page.collection, page.slug),
      features: page.features,
    }),
  }
}

/** The page's graph, read when another page is picked and again when `revision` moves on */
export function usePageGraph(target: PageGraphTarget, revision: number): Loaded<PageGraphRead> {
  const latest = useRef(target)
  // Set once the render commits, and before the read it starts runs
  useLayoutEffect(() => {
    latest.current = target
  })
  const key = `${target.page.collection}/${target.page.slug}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: another page is a new read; newer findings or settings come with `revision`
  const load = useCallback(() => readPageGraph(latest.current), [key])
  const { loaded, reload } = useLoaded(load, 'The page could not be read')
  const seen = useRef(revision)
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    reload()
  }, [revision, reload])
  return loaded
}
