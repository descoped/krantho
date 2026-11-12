import { Network, PenLine } from 'lucide-react'
import { type ReactElement, useId, useMemo, useState } from 'react'
import type { ResolvedEntity, SeoConfigData } from '../../lib/api-types.js'
import type { Loaded } from '../../site/use-loaded.js'
import { Button } from '../../ui/button.js'
import { DataCard, DataNote } from './data-card.js'
import { EntityList } from './entity-list.js'
import { GraphEditor } from './graph-editor.js'
import { JsonLdCode } from './json-ld-code.js'
import { type EntityView, entityViews, scopeCounts } from './provenance.js'
import { ScopeLegend } from './scope-chip.js'
import type { GraphSource } from './use-data-sources.js'
import './graph-card.css'

export interface GraphCardProps {
  initialOpen?: boolean | undefined
  resolved: Loaded<ResolvedEntity[]>
  graph: Loaded<GraphSource>
  collection: string
  slug: string
  version: number
  /** Why the graph is browsed, not edited; null when this viewer may save it */
  readOnly: string | null
  onStage: (config: SeoConfigData) => void
  draftConfig: SeoConfigData | undefined
}

/** The emitted nodes joined to the resolved entities, once both are read */
function useViews(resolved: Loaded<ResolvedEntity[]>, graph: Loaded<GraphSource>): EntityView[] {
  return useMemo(() => {
    if (resolved.state !== 'ready' || graph.state !== 'ready') return []
    const siteTypes = new Set(
      graph.data.catalogTypes.filter((type) => type.siteLevel).map((type) => type.type),
    )
    return entityViews({ nodes: graph.data.nodes, resolved: resolved.data, siteTypes })
  }, [resolved, graph])
}

function Entities({
  resolved,
  graph,
}: {
  resolved: Loaded<ResolvedEntity[]>
  graph: Loaded<GraphSource>
}): ReactElement {
  const views = useViews(resolved, graph)
  const failed = [resolved, graph].find((source) => source.state === 'error')
  if (failed?.state === 'error') return <DataNote tone="error">{failed.message}</DataNote>
  if (resolved.state === 'loading' || graph.state === 'loading') {
    return <DataNote>Reading the structured data…</DataNote>
  }
  if (views.length === 0) return <DataNote>The page emits no entities.</DataNote>
  return (
    <>
      <ScopeLegend counts={scopeCounts(views)} />
      <EntityList views={views} />
    </>
  )
}

/** The JSON-LD as composed for the page, behind a disclosure: view-source, with Copy */
function Emitted({ graph }: { graph: Loaded<GraphSource> }): ReactElement {
  if (graph.state === 'loading') return <DataNote>Composing the JSON-LD…</DataNote>
  if (graph.state === 'error') return <DataNote tone="error">{graph.message}</DataNote>
  return (
    <details className="data-disclosure">
      <summary>What the page emits · view-source</summary>
      <JsonLdCode data={graph.data.emitted} label="application/ld+json" />
    </details>
  )
}

/** Opens the graph editor below the card's lists; the button keeps focus */
function EditToggle({
  open,
  readOnly,
  controls,
  onToggle,
}: {
  open: boolean
  readOnly: string | null
  controls: string
  onToggle: () => void
}): ReactElement {
  const label = readOnly ? 'Browse the graph' : 'Edit the graph'
  return (
    <Button
      size="sm"
      icon={readOnly ? Network : PenLine}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {open ? 'Close the graph editor' : label}
    </Button>
  )
}

/**
 * "JSON-LD graph · what this page emits": each entity with its type, `@id`
 * and scope, each value with its source (§6), the JSON-LD as composed, and
 * the graph editor at the document scope
 */
export function GraphCard(props: GraphCardProps): ReactElement {
  const { graph } = props
  const [editing, setEditing] = useState(props.initialOpen ?? false)
  const editorId = useId()
  return (
    <DataCard
      title="JSON-LD graph · what this page emits"
      lead={`Every node the page emits, with its type, @id and scope, and each value with where it comes from; a value krantho adds while composing the page reads computed. Sources are read for the saved version, v${props.version}.`}
      aside={
        graph.state === 'ready' ? (
          <EditToggle
            open={editing}
            readOnly={props.readOnly}
            controls={editorId}
            onToggle={() => setEditing((open) => !open)}
          />
        ) : null
      }
    >
      <Entities resolved={props.resolved} graph={graph} />
      <Emitted graph={graph} />
      <div id={editorId}>
        {editing && graph.state === 'ready' && (
          <GraphEditor
            source={graph.data}
            collection={props.collection}
            slug={props.slug}
            readOnly={props.readOnly}
            onStage={props.onStage}
            draftConfig={props.draftConfig}
          />
        )}
      </div>
    </DataCard>
  )
}
