import { lazy, type ReactElement, Suspense } from 'react'
import type { SeoConfigData } from '../../lib/api-types.js'
import { useToast } from '../../ui/toast.js'
import { DataNote } from './data-card.js'
import type { GraphSource } from './use-data-sources.js'

const GraphBrowser = lazy(() =>
  import('../../components/jsonld-graph/GraphBrowser.js').then((m) => ({
    default: m.GraphBrowser,
  })),
)

export interface GraphEditorProps {
  source: GraphSource
  collection: string
  slug: string
  /** Why the graph is browsed, not edited — someone else's lock, or a role that cannot edit; null when it can be saved */
  readOnly: string | null
  /** Stage graph values in the ordinary document draft. */
  onStage: (config: SeoConfigData) => void
  draftConfig: SeoConfigData | undefined
}

/**
 * The graph editor at the document scope: edit a value of any entity, add or
 * delete entities, follow references, import JSON-LD with its diff, export,
 * and discard or apply values to the document draft.
 */
export function GraphEditor(props: GraphEditorProps): ReactElement {
  const { source, collection, slug, readOnly, onStage } = props
  const toast = useToast()
  async function save(config: SeoConfigData): Promise<void> {
    onStage(config)
    toast({ text: 'Graph added to your draft. Save draft, then publish when ready.' })
  }
  return (
    <div className="data-graph-editor">
      {readOnly ? (
        <DataNote>{readOnly}</DataNote>
      ) : (
        <DataNote>
          Apply adds your graph changes to this document’s draft. Save draft keeps a snapshot;
          Publish updates the live page.
        </DataNote>
      )}
      <Suspense fallback={<DataNote>Loading the graph editor…</DataNote>}>
        <GraphBrowser
          saveLabel="Apply to draft"
          model={source.model}
          catalogTypes={source.catalogTypes}
          catalogDetails={source.catalogDetails}
          rawData={source.emitted}
          collection={collection}
          slug={slug}
          configData={readOnly ? undefined : (props.draftConfig ?? source.editable)}
          onSave={readOnly ? undefined : save}
        />
      </Suspense>
    </div>
  )
}
