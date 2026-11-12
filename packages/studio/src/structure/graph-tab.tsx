import { Download, FileSearch, Network, PenLine } from 'lucide-react'
import { type ReactElement, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { JsonLdCode } from '../editor/data-mode/json-ld-code.js'
import { useMediaQuery } from '../hooks/use-media-query.js'
import type { PageSeoSummary, SeoConfig } from '../lib/api.js'
import { downloadFile, exportAsJsonLd, generateFilename } from '../lib/export-helpers.js'
import { dataModePath } from '../lib/paths.js'
import { Button, buttonClass } from '../ui/button.js'
import { EmptyState } from '../ui/empty-state.js'
import { GraphCanvas } from './graph-canvas.js'
import { GraphList } from './graph-list.js'
import { type GraphNodeView, legendKinds, NODE_KINDS, type PageGraph } from './graph-model.js'
import { KindChip } from './graph-node.js'
import { NodeCard } from './node-card.js'
import { type ServedGraph, servedJsonLd } from './served-graph.js'
import type { TabProps } from './structure-page.js'
import { type SiteFindings, siteLevelTypes } from './structure-sources.js'
import { type PageGraphTarget, usePageGraph } from './use-page-graph.js'
import './graph.css'

/** The canvas needs room; below this the graph is a list */
const WIDE = '(min-width: 1200px)'
const PAGE_PARAM = 'page'

const pageKey = (page: PageSeoSummary): string => `${page.collection}/${page.slug}`

/** The live page picked in the address (`?page=collection/slug`), else the first */
function usePickedPage(
  pages: readonly PageSeoSummary[],
): [PageSeoSummary | null, (key: string) => void] {
  const [params, setParams] = useSearchParams()
  const picked = params.get(PAGE_PARAM)
  const page = pages.find((p) => pageKey(p) === picked) ?? pages[0] ?? null
  const pick = (key: string): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set(PAGE_PARAM, key)
        return next
      },
      { replace: true },
    )
  }
  return [page, pick]
}

function PagePicker({
  pages,
  value,
  onChange,
}: {
  pages: readonly PageSeoSummary[]
  value: string
  onChange: (key: string) => void
}): ReactElement {
  const id = useId()
  return (
    <div className="structure-field">
      <label htmlFor={id}>Page</label>
      <select
        id={id}
        className="structure-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {pages.map((page) => (
          <option key={pageKey(page)} value={pageKey(page)}>
            {page.path} · {pageKey(page)}
          </option>
        ))}
      </select>
    </div>
  )
}

function Legend({ graph }: { graph: PageGraph }): ReactElement {
  return (
    <ul className="structure-legend" aria-label="Where each node comes from">
      {legendKinds(graph).map((kind) => (
        <li key={kind}>
          <KindChip kind={kind} />
          <span className="structure-legend-text">{NODE_KINDS[kind].meaning}</span>
        </li>
      ))}
    </ul>
  )
}

/** The node to show first: the page's own main entity, else the first node */
function firstNode(graph: PageGraph): GraphNodeView | null {
  return (
    graph.nodes.find((node) => node.kind !== 'site' && node.kind !== 'derived') ??
    graph.nodes[0] ??
    null
  )
}

interface ServedViewProps {
  page: PageSeoSummary
  served: ServedGraph
  graph: PageGraph
  readerName: (id: string) => string
}

/** Download the JSON-LD as served, or open the page's Data mode to edit or import it */
function GraphActions({ page, served }: Pick<ServedViewProps, 'page' | 'served'>): ReactElement {
  function exportGraph(): void {
    const filename = generateFilename(page.collection, page.slug)
    downloadFile(exportAsJsonLd(servedJsonLd(served)), filename, 'application/ld+json')
  }
  return (
    <div className="structure-actions">
      <Button size="sm" icon={Download} onClick={exportGraph}>
        Export JSON-LD
      </Button>
      <Link
        to={dataModePath(page.collection, page.slug)}
        className={buttonClass('secondary', 'sm')}
      >
        <PenLine className="ui-button-icon" aria-hidden="true" />
        Edit or import in Data mode
      </Link>
    </div>
  )
}

function ServedView({ page, served, graph, readerName }: ServedViewProps): ReactElement {
  const wide = useMediaQuery(WIDE)
  const [picked, setPicked] = useState<string | null>(null)
  const selected = graph.nodes.find((node) => node.key === picked) ?? firstNode(graph)
  const View = wide ? GraphCanvas : GraphList
  return (
    <>
      <div className="structure-row">
        <Legend graph={graph} />
        <GraphActions page={page} served={served} />
      </div>
      <View graph={graph} selected={selected?.key ?? null} onSelect={setPicked} />
      {selected && (
        <NodeCard
          node={selected}
          collection={page.collection}
          slug={page.slug}
          readerName={readerName}
        />
      )}
      {served.unreadable > 0 && (
        <p className="structure-note">
          {served.unreadable} JSON-LD script{served.unreadable === 1 ? ' is' : 's are'} not valid
          JSON: search engines skip {served.unreadable === 1 ? 'it' : 'them'}.
        </p>
      )}
      <details className="structure-disclosure">
        <summary>What the page emits · view-source</summary>
        <JsonLdCode data={servedJsonLd(served)} label={`application/ld+json · ${page.path}`} />
      </details>
    </>
  )
}

function PageGraphView({
  target,
  revision,
  readerName,
}: {
  target: PageGraphTarget
  revision: number
  readerName: (id: string) => string
}): ReactElement {
  const read = usePageGraph(target, revision)
  if (read.state === 'loading')
    return <p className="structure-note">Reading {target.page.path} as served…</p>
  if (read.state === 'error')
    return <p className="structure-note structure-note--error">{read.message}</p>
  if (read.data.state === 'unserved') {
    return (
      <EmptyState icon={FileSearch} title="The page could not be read as served">
        {read.data.reason}
      </EmptyState>
    )
  }
  return (
    <ServedView
      // A new page starts from its own main entity
      key={`${target.page.collection}/${target.page.slug}`}
      page={target.page}
      served={read.data.served}
      graph={read.data.graph}
      readerName={readerName}
    />
  )
}

function LivePages({
  findings,
  configs,
  siteTypes,
  revision,
}: {
  findings: SiteFindings
  configs: readonly SeoConfig[]
  siteTypes: ReadonlySet<string>
  revision: number
}): ReactElement {
  const [page, pick] = usePickedPage(findings.pages)
  const readerName = (id: string): string => findings.readers.find((r) => r.id === id)?.name ?? id
  const target = useMemo(
    () => (page ? { page, configs, siteTypes } : null),
    [page, configs, siteTypes],
  )
  if (!page || !target) {
    return (
      <EmptyState icon={Network} title="No live pages yet">
        The graph is read from the pages the site serves. Publish a page to see its graph.
      </EmptyState>
    )
  }
  return (
    <>
      <p className="structure-tab-lead">
        A live page's graph as the site serves it, in the default locale. Each node's values carry
        their source; its rich results follow the search engines' rules.
      </p>
      <PagePicker pages={findings.pages} value={pageKey(page)} onChange={pick} />
      <PageGraphView target={target} revision={revision} readerName={readerName} />
    </>
  )
}

/** Graph: one live page's graph as served — nodes, links, sources, and what the page emits */
export function GraphTab({ base, state }: TabProps): ReactElement {
  const configs = base.configs.state === 'ok' ? base.configs.value : []
  const siteTypes = useMemo(() => siteLevelTypes(base.catalog), [base.catalog])
  const { findings } = state
  if (findings.state === 'loading') return <p className="structure-note">Reading the live pages…</p>
  if (findings.state === 'error')
    return <p className="structure-note structure-note--error">{findings.message}</p>
  return (
    <LivePages
      findings={findings.data}
      configs={configs}
      siteTypes={siteTypes}
      revision={state.revision}
    />
  )
}
