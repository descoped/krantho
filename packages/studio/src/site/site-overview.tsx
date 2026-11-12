import { collectionBasePath } from '@krantho/core/cache-tags'
import { FileText, FolderTree, LayoutTemplate } from 'lucide-react'
import { type ReactElement, type RefObject, useCallback, useId, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCapabilities } from '../lib/capabilities.js'
import { collectionLabel } from '../lib/format.js'
import { collectionPath } from '../lib/paths.js'
import { DataTable, DataTableSkeleton } from '../ui/data-table.js'
import { EmptyState } from '../ui/empty-state.js'
import { LoadError } from './load-error.js'
import { type CellContext, rowEditorPath } from './site-cells.js'
import { overviewColumns } from './site-columns.js'
import { type SiteRow, statusCounts } from './site-model.js'
import { loadSiteOverview, type OverviewSection, type SiteOverviewData } from './site-sources.js'
import { StatusSummary } from './status-summary.js'
import { useLoaded } from './use-loaded.js'
import { usePendingFocus } from './use-pending-focus.js'
import './site.css'

interface TableProps {
  caption: string
  rows: readonly SiteRow[]
  context: CellContext
  localization: boolean
}

function OverviewTable({ caption, rows, context, localization }: TableProps): ReactElement {
  const navigate = useNavigate()
  const columns = useMemo(() => overviewColumns(context, localization), [context, localization])
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.slug}
      onRowClick={(row) => navigate(rowEditorPath(row, context.defaultLocale))}
    />
  )
}

function CollectionSection({
  section,
  context,
  localization,
}: {
  section: OverviewSection
  context: CellContext
  localization: boolean
}): ReactElement {
  const titleId = useId()
  const { collection, rows } = section
  const label = collectionLabel(collection.name)
  const pattern = collectionBasePath(collection)
  return (
    <section className="site-panel" aria-labelledby={titleId}>
      <div className="site-panel-head">
        <div className="site-panel-title">
          <h2 id={titleId}>
            <Link to={collectionPath(collection.name)}>{label}</Link>
          </h2>
          <code className="site-pattern">{pattern ?? 'no pages'}</code>
        </div>
        <StatusSummary counts={statusCounts(rows)} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={`No ${label.toLowerCase()} yet`}>
          Documents you create in this collection show up here.
        </EmptyState>
      ) : (
        <OverviewTable caption={label} rows={rows} context={context} localization={localization} />
      )}
    </section>
  )
}

function LayoutSection({
  rows,
  context,
  localization,
}: {
  rows: readonly SiteRow[]
  context: CellContext
  localization: boolean
}): ReactElement {
  const titleId = useId()
  return (
    <section className="site-panel" aria-labelledby={titleId}>
      <div className="site-panel-head">
        <div className="site-panel-title">
          <h2 id={titleId}>Layout</h2>
          <span className="site-pattern-note">no URL, shared · read by every page</span>
        </div>
        <StatusSummary counts={statusCounts(rows)} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No globals yet">
          Globals hold the frame every page shares: header, footer, contact.
        </EmptyState>
      ) : (
        <OverviewTable caption="Layout" rows={rows} context={context} localization={localization} />
      )}
    </section>
  )
}

function OverviewBody({ data }: { data: SiteOverviewData }): ReactElement {
  const { site } = data.site
  const context = useMemo<CellContext>(
    () => ({ baseUrl: site.baseUrl, defaultLocale: data.locales.defaultLocale }),
    [site.baseUrl, data.locales.defaultLocale],
  )
  return (
    <>
      {data.sections.map((section) => (
        <CollectionSection
          key={section.collection.name}
          section={section}
          context={context}
          localization={data.localization}
        />
      ))}
      {data.layout && (
        <LayoutSection rows={data.layout} context={context} localization={data.localization} />
      )}
    </>
  )
}

function OverviewSkeleton(): ReactElement {
  return (
    <div className="site-panel" aria-hidden="true">
      <div className="site-panel-head">
        <span className="site-skeleton-title" />
      </div>
      <DataTableSkeleton />
    </div>
  )
}

function OverviewHeader({
  headingRef,
  defaultLocale,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  defaultLocale: string | null
}): ReactElement {
  return (
    <header className="site-header">
      <h1 ref={headingRef} className="site-heading site-focus-target" tabIndex={-1}>
        Site
      </h1>
      <p className="site-lede">
        What you are editing: each collection's documents
        {defaultLocale && (
          <>
            {' '}
            in <code>{defaultLocale}</code>
          </>
        )}
        , and the Layout every page shares.
      </p>
    </header>
  )
}

function NoCollections(): ReactElement {
  return (
    <div className="site-panel">
      <EmptyState icon={FolderTree} title="No collections">
        Collections are defined in code, in <code>krantho.collections.ts</code>.
      </EmptyState>
    </div>
  )
}

/** Site: every collection with its documents, then the Layout's globals */
export function SiteOverview(): ReactElement {
  const caps = useCapabilities()
  const load = useCallback(() => loadSiteOverview(caps), [caps])
  const { loaded, reload } = useLoaded(load, 'The site could not load')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  // After Try again, focus goes to the heading of what loaded, or back to the error
  const requestFocus = usePendingFocus(loaded.state, { ready: headingRef, error: errorRef })
  const retry = (): void => {
    reload()
    requestFocus()
  }
  const data = loaded.state === 'ready' ? loaded.data : null
  return (
    <div className="site" aria-busy={loaded.state === 'loading'}>
      <OverviewHeader headingRef={headingRef} defaultLocale={data?.locales.defaultLocale ?? null} />
      {loaded.state === 'loading' && (
        <>
          <p className="visually-hidden" role="status">
            Loading the site…
          </p>
          <OverviewSkeleton />
        </>
      )}
      {loaded.state === 'error' && (
        <LoadError
          title="The site could not load"
          message={loaded.message}
          onRetry={retry}
          panelRef={errorRef}
        />
      )}
      {data && <OverviewBody data={data} />}
      {data && data.sections.length === 0 && <NoCollections />}
    </div>
  )
}
