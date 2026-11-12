import { documentPath } from '@krantho/core/cache-tags'
import { documentSeoProperties } from '@krantho/seo-shared'
import { FileQuestion } from 'lucide-react'
import { type ReactElement, useCallback, useState } from 'react'
import type { ContentItem, SeoConfigData } from '../../lib/api-types.js'
import { isEnabled, useCapabilities } from '../../lib/capabilities.js'
import { seoSettingsChanged } from '../../lib/seo-settings-revision.js'
import { pageUrl } from '../../site/site-model.js'
import { EmptyState } from '../../ui/empty-state.js'
import type { EditorSource } from '../use-editor-source.js'
import type { Workspace } from '../use-workspace.js'
import { DataCard, DataNote } from './data-card.js'
import { EnrichmentCard } from './enrichment-card.js'
import { changedContent, type EnrichFacts, type StepOutcome } from './enrichment-model.js'
import { FindingsCard } from './findings-card.js'
import { GraphCard } from './graph-card.js'
import { HistoryCard } from './history-card.js'
import { firstEntityProperties, type PagePreview, pagePreview } from './preview-model.js'
import { RichResultsCard } from './rich-results-card.js'
import { ChecksCard, IndexingCard, SearchResultCard } from './search-cards.js'
import { SocialCard } from './social-card.js'
import { type DataTarget, type GraphSource, useDataSources } from './use-data-sources.js'
import '../structure-mode.css'
import './data-mode.css'

export interface DataModeProps {
  initialGraphOpen?: boolean | undefined
  ws: Workspace
  source: EditorSource
}

/** The page's address on the site; null when the collection has no pages or the site's address is unknown */
function addressOf(source: EditorSource, slug: string): string | null {
  const path = source.collection ? documentPath(source.collection, slug) : null
  const base = source.site?.site.baseUrl
  return path !== null && base ? pageUrl(base, path) : null
}

/** The search and social previews, from the draft and the SEO settings once they are read */
function previewOf(
  ws: Workspace,
  source: EditorSource,
  document: ContentItem,
  graph: GraphSource | null,
): PagePreview {
  return pagePreview({
    fields: ws.draft.draft.fields,
    slug: document.meta.slug,
    pageUrl: addressOf(source, document.meta.slug),
    documentSeo: documentSeoProperties(ws.draft.draft.metadata),
    siteSeo: firstEntityProperties(graph?.configs.site ?? null),
    siteName: source.site?.site.name ?? '',
  })
}

function targetOf(document: ContentItem, source: EditorSource): DataTarget {
  const { meta } = document
  return {
    collection: meta.collection,
    slug: meta.slug,
    locale: meta.locale,
    version: meta.version,
    live: meta.liveVersion !== null,
    // The default locale comes only from the site's locales (lib/locales.ts); unknown is not the default
    defaultLocale: source.locales !== null && meta.locale === source.locales.defaultLocale,
  }
}

function enrichFacts(ws: Workspace, source: EditorSource, target: DataTarget): EnrichFacts {
  return {
    saved: true,
    admin: ws.isAdmin,
    canEdit: ws.canEdit,
    lockedBy: ws.facts.lockedBy,
    dirty: ws.draft.dirty,
    defaultLocale: target.defaultLocale,
    defaultLocaleName: source.locales?.defaultLocale ?? null,
  }
}

interface SavedProps extends DataModeProps {
  document: ContentItem
}

/** What the draft shows now, before it is saved: the previews, indexing and the checks */
/** Why the graph editor only browses: the API saves a page's SEO settings for admins, under no one else's lock */
function graphReadOnly(ws: Workspace): string | null {
  if (ws.readOnly) return 'Read-only: the graph can be browsed and exported, not changed.'
  if (!ws.schema?.contract.metadata['seo'])
    return 'This content form does not include structured data overrides.'
  return null
}

function DraftCards({
  ws,
  source,
  document,
  preview,
}: SavedProps & { preview: PagePreview }): ReactElement {
  const { fields } = ws.draft.draft
  return (
    <>
      <SearchResultCard preview={preview} />
      <SocialCard preview={preview} fields={fields} readOnly={ws.readOnly} onField={ws.setField} />
      <IndexingCard
        fields={fields}
        pageUrl={addressOf(source, document.meta.slug)}
        readOnly={ws.readOnly}
        onField={ws.setField}
      />
      <ChecksCard draft={ws.draft.draft} limits={source.site?.seo.limits ?? null} />
    </>
  )
}

/** Read the document and its structured data again after enrichment, as far as it changed them */
function useOnEnriched(
  ws: Workspace,
  reread: () => void,
): (outcomes: readonly StepOutcome[]) => void {
  const { reloadDocument } = ws
  return useCallback(
    (outcomes: readonly StepOutcome[]) => {
      reread()
      if (changedContent(outcomes)) void reloadDocument()
    },
    [reread, reloadDocument],
  )
}

/** The structured data of a saved page: previews, the graph, rich results, findings and enrichment */
function SeoCards({ ws, source, document, initialGraphOpen }: SavedProps): ReactElement {
  const [revision, setRevision] = useState(0)
  const target = targetOf(document, source)
  const data = useDataSources(target, revision)
  // A graph saved or an enrichment run changed the settings: this mode and the side panel read them again
  const reread = useCallback(() => {
    setRevision((n) => n + 1)
    seoSettingsChanged()
  }, [])
  const onEnriched = useOnEnriched(ws, reread)
  const graph = data.graph.state === 'ready' ? data.graph.data : null
  const { meta } = document
  return (
    <>
      <DraftCards
        ws={ws}
        source={source}
        document={document}
        preview={previewOf(ws, source, document, graph)}
      />
      <GraphCard
        initialOpen={initialGraphOpen}
        resolved={data.resolved}
        graph={data.graph}
        collection={meta.collection}
        slug={meta.slug}
        version={meta.version}
        readOnly={graphReadOnly(ws)}
        onStage={(config) =>
          ws.draft.setMetadata({
            ...ws.draft.draft.metadata,
            seo: config as unknown as Record<string, unknown>,
          })
        }
        draftConfig={ws.draft.draft.metadata['seo'] as unknown as SeoConfigData | undefined}
      />
      <RichResultsCard rich={data.rich} />
      <FindingsCard findings={data.findings} version={meta.version} />
      <EnrichmentCard
        target={{ collection: meta.collection, slug: meta.slug }}
        facts={enrichFacts(ws, source, target)}
        onFinished={onEnriched}
      />
    </>
  )
}

/** Why the structured data is not shown: SEO is off, or the documents have no page */
function NoStructuredData({ seo }: { seo: boolean }): ReactElement {
  return (
    <DataCard title="Structured data">
      <DataNote>
        {seo
          ? "This collection's documents have no page, so they emit no structured data and search engines do not read them."
          : 'SEO is off on this site: no structured data, previews or findings are made.'}
      </DataNote>
    </DataCard>
  )
}

/**
 * The history of the locale version being edited, with Diff and Restore (an
 * admin's, when no one else holds the lock): Data mode's, and a global's in
 * Where it appears
 */
export function DocumentHistory({
  ws,
  document,
}: {
  ws: Workspace
  document: ContentItem
}): ReactElement {
  const { meta } = document
  return (
    <HistoryCard
      collection={meta.collection}
      slug={meta.slug}
      locale={meta.locale}
      saved={{ version: meta.version, liveVersion: meta.liveVersion }}
      draft={ws.draft.draft}
      unsaved={ws.draft.dirty}
      canRestore={ws.isAdmin && !ws.readOnly}
      onRestored={ws.reloadDocument}
      onPrepare={ws.prepareSnapshot}
    />
  )
}

/**
 * Data mode: what the page emits — its search result and social cards from
 * the draft, the `@graph` with where each value comes from, rich results by
 * the search engines' rules, findings per search engine, enrichment, and the
 * history of the locale version being edited
 */
export function DataMode({ ws, source, initialGraphOpen }: DataModeProps): ReactElement {
  const seo = isEnabled(useCapabilities(), 'seo')
  const { document } = ws
  if (!document) {
    return (
      <div className="data-mode">
        <EmptyState icon={FileQuestion} title="Nothing saved yet">
          Data mode reads the saved page: its structured data, findings and history. Save a draft
          first.
        </EmptyState>
      </div>
    )
  }
  const renders = source.collection?.pages ?? false
  return (
    <div className="data-mode">
      {seo && renders ? (
        <SeoCards ws={ws} source={source} document={document} initialGraphOpen={initialGraphOpen} />
      ) : (
        <NoStructuredData seo={seo} />
      )}
      <DocumentHistory ws={ws} document={document} />
    </div>
  )
}
