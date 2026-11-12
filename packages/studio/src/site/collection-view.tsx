import { FileText, SearchX } from 'lucide-react'
import { type ReactElement, type RefObject, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../lib/auth.js'
import { collectionLabel } from '../lib/format.js'
import { NotFound } from '../shell/not-found.js'
import { Button } from '../ui/button.js'
import { DataTable, DataTableSkeleton, type RowSelection } from '../ui/data-table.js'
import { EmptyState } from '../ui/empty-state.js'
import { type BulkAction, BulkModal } from './bulk-modal.js'
import { CollectionHeader, useExport } from './collection-header.js'
import { CollectionToolbar } from './collection-toolbar.js'
import { ImportModal } from './import-modal.js'
import { LoadError } from './load-error.js'
import { SelectionBar } from './selection-bar.js'
import { type CellContext, rowEditorPath } from './site-cells.js'
import { collectionColumns } from './site-columns.js'
import type { SiteRow } from './site-model.js'
import type { CollectionViewData } from './site-sources.js'
import { type CollectionDialogs, useCollectionDialogs } from './use-collection-dialogs.js'
import { type CollectionView, useCollectionView } from './use-collection-view.js'
import { usePendingFocus } from './use-pending-focus.js'
import './site.css'
import './collection-view.css'

/** Where focus goes after an action removes the control that started it */
interface ScreenFocus {
  listingRef: RefObject<HTMLElement | null>
  errorRef: RefObject<HTMLDivElement | null>
  /** Move focus once the screen settles: the listing, or the error that replaced it */
  request: () => void
}

interface ScreenProps {
  name: string
  data: CollectionViewData
  view: CollectionView
  focus: ScreenFocus
}

/** Row checkboxes for editors; none for a viewer, who cannot act on them */
function useTableSelection(view: CollectionView): RowSelection<SiteRow> | undefined {
  const { hasRole } = useAuth()
  const { selected, toggle, toggleAll } = view.selection
  return useMemo(
    () =>
      hasRole('editor')
        ? { selected, onToggle: toggle, onToggleAll: toggleAll, rowLabel: (row) => row.slug }
        : undefined,
    [hasRole, selected, toggle, toggleAll],
  )
}

function Rows({ name, data, view, focus }: ScreenProps): ReactElement {
  const navigate = useNavigate()
  const { site } = data.site
  const context = useMemo<CellContext>(
    () => ({ baseUrl: site.baseUrl, defaultLocale: data.locales.defaultLocale }),
    [site.baseUrl, data.locales.defaultLocale],
  )
  const columns = useMemo(
    () => collectionColumns(context, data.localization),
    [context, data.localization],
  )
  const selection = useTableSelection(view)
  if (view.counts.total === 0) {
    return (
      <EmptyState icon={FileText} title={`No ${collectionLabel(name).toLowerCase()} yet`}>
        Documents you create in this collection show up here.
      </EmptyState>
    )
  }
  if (view.rows.length === 0) {
    const showAll = (
      <Button
        onClick={() => {
          view.choose('status', 'all', 'all')
          focus.request()
        }}
      >
        Show all
      </Button>
    )
    return <EmptyState icon={SearchX} title="No document has this status" action={showAll} />
  }
  return (
    <DataTable
      caption={`${collectionLabel(name)} in ${data.locale}`}
      columns={columns}
      rows={view.rows}
      rowKey={(row) => row.slug}
      onRowClick={(row) => navigate(rowEditorPath(row, context.defaultLocale))}
      selection={selection}
    />
  )
}

interface ListingProps extends ScreenProps {
  onAction: (action: BulkAction) => void
}

function Listing({ name, data, view, focus, onAction }: ListingProps): ReactElement {
  const { hasRole } = useAuth()
  return (
    <section
      ref={focus.listingRef}
      className="site-panel site-focus-target"
      aria-label={`${collectionLabel(name)} documents`}
      tabIndex={-1}
    >
      <CollectionToolbar
        filter={view.choices.filter}
        order={view.choices.order}
        locale={data.locale}
        locales={data.locales.supportedLocales}
        counts={view.counts}
        shown={view.rows.length}
        onFilter={(filter) => view.choose('status', filter, 'all')}
        onOrder={(order) => view.choose('sort', order, 'updated')}
        onLocale={(locale) => view.choose('locale', locale, data.locales.defaultLocale)}
      />
      {view.selection.slugs.length > 0 && (
        <SelectionBar
          count={view.selection.slugs.length}
          canPublish={hasRole('editor')}
          canDelete={hasRole('admin')}
          onAction={onAction}
          onClear={() => {
            view.selection.clear()
            focus.request()
          }}
        />
      )}
      <Rows name={name} data={data} view={view} focus={focus} />
    </section>
  )
}

function Dialogs({
  dialogs,
  name,
}: {
  dialogs: CollectionDialogs
  name: string
}): ReactElement | null {
  const { dialog, close, changed } = dialogs
  if (dialog?.kind === 'import') {
    return <ImportModal collection={name} onClose={close} onImported={changed} />
  }
  if (dialog?.kind !== 'bulk') return null
  return (
    <BulkModal
      action={dialog.action}
      collection={name}
      slugs={dialog.slugs}
      locale={dialog.locale}
      onClose={close}
      onDone={changed}
    />
  )
}

/** The list's three states: loading, could not load, and the listing itself */
function Body({
  name,
  view,
  dialogs,
  focus,
}: {
  name: string
  view: CollectionView
  dialogs: CollectionDialogs
  focus: ScreenFocus
}): ReactElement | null {
  const { loaded } = view
  if (loaded.state === 'loading') {
    return (
      <>
        <p className="visually-hidden" role="status">
          Loading {collectionLabel(name).toLowerCase()}…
        </p>
        <div className="site-panel" aria-hidden="true">
          <DataTableSkeleton rows={4} />
        </div>
      </>
    )
  }
  if (loaded.state === 'error') {
    const retry = (): void => {
      view.reload()
      focus.request()
    }
    const title = 'The collection could not load'
    return (
      <LoadError title={title} message={loaded.message} onRetry={retry} panelRef={focus.errorRef} />
    )
  }
  return (
    <Listing name={name} data={loaded.data} view={view} focus={focus} onAction={dialogs.openBulk} />
  )
}

/** The screen's focus targets, and the request that moves focus to whichever is shown */
function useScreenFocus(view: CollectionView): ScreenFocus {
  const listingRef = useRef<HTMLElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const request = usePendingFocus(view.loaded.state, { ready: listingRef, error: errorRef })
  return useMemo(() => ({ listingRef, errorRef, request }), [request])
}

function CollectionScreen({ name }: { name: string }): ReactElement {
  const view = useCollectionView(name)
  const focus = useScreenFocus(view)
  const dialogs = useCollectionDialogs(view, focus.request)
  const data = view.loaded.state === 'ready' ? view.loaded.data : null
  const exporter = useExport(name, data?.locale ?? null)

  if (data && !data.collection) return <NotFound />
  return (
    <div className="site" aria-busy={view.loaded.state === 'loading'}>
      <CollectionHeader
        name={name}
        data={data}
        notice={exporter.notice}
        onExport={() => void exporter.run()}
        onImport={dialogs.openImport}
      />
      <Body name={name} view={view} dialogs={dialogs} focus={focus} />
      <Dialogs dialogs={dialogs} name={name} />
    </div>
  )
}

/** A collection's view: its documents in one locale, filtered, sorted and acted on in bulk */
export function CollectionPage(): ReactElement {
  const { collection } = useParams<{ collection: string }>()
  if (!collection) return <NotFound />
  // A new collection starts with a new selection and a fresh read
  return <CollectionScreen key={collection} name={collection} />
}
