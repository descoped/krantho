import { type EmittedNode, emittedNodes } from '../editor/data-mode/graph-config.js'

/**
 * The JSON-LD a page carries as the site serves it: every
 * `<script type="application/ld+json">` of its HTML, read as a visitor's
 * browser reads it. This is what search engines and assistants get — the
 * page's own template, its trail and kind included — not a composition of it.
 */
export interface ServedGraph {
  /** Each script's JSON, in the page's order: the JSON-LD as served */
  scripts: unknown[]
  /** The nodes of every script's graph, in order */
  nodes: EmittedNode[]
  /** Scripts whose text is not JSON: counted, so a broken one is said, never hidden */
  unreadable: number
}

/** Read the JSON-LD of a page's HTML */
export function servedGraph(html: string): ServedGraph {
  const page = new DOMParser().parseFromString(html, 'text/html')
  const scripts: unknown[] = []
  let unreadable = 0
  for (const script of page.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      scripts.push(JSON.parse(script.textContent ?? ''))
    } catch {
      unreadable++
    }
  }
  return { scripts, nodes: scripts.flatMap(emittedNodes), unreadable }
}

/** The JSON-LD as served, as one value to show and export: the one script, or every script in a list */
export function servedJsonLd(graph: ServedGraph): unknown {
  return graph.scripts.length === 1 ? graph.scripts[0] : graph.scripts
}
