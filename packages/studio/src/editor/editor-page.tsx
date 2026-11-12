import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useParams, useSearchParams } from 'react-router'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { singularLabel } from '../lib/format.js'
import { hasSeveralLocales } from '../lib/locales.js'
import { LAYOUT_COLLECTION } from '../lib/paths.js'
import { NotFound } from '../shell/not-found.js'
import { LoadError } from '../site/load-error.js'
import { HistoryCard } from './data-mode/history-card.js'
import { EditorColumns } from './editor-canvas.js'
import { type Dialog, Dialogs } from './editor-dialogs.js'
import { EditorHeader } from './editor-header.js'
import { EditorNotices } from './editor-notices.js'
import { type SiteLink, siteLink } from './header-model.js'
import { LocaleChips } from './locale-chips.js'
import {
  type EditorKind,
  type EditorMode,
  type EditorModeId,
  editorModes,
  MODE_PARAM,
  type ModeContext,
  modeFromParam,
} from './modes.js'
import { type EditorSource, type EditorTarget, useEditorSource } from './use-editor-source.js'
import { useWorkspace, type Workspace } from './use-workspace.js'
import './editor.css'

interface WorkspaceProps {
  source: EditorSource
  target: EditorTarget
}

/** Focus the editor when it opens with focus nowhere — after a locale switch or a create */
function useFocusOnOpen(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) ref.current?.focus()
  }, [ref])
}

/** The locale chips, when the site has several locales (Setup › Locales) and the document is saved */
function Locales({ ws, source }: { ws: Workspace; source: EditorSource }): ReactElement | null {
  const { locales } = source
  if (!ws.document || !locales || !hasSeveralLocales(locales)) return null
  return (
    <LocaleChips
      collection={ws.document.meta.collection}
      slug={ws.document.meta.slug}
      current={ws.document.meta.locale}
      locales={locales.supportedLocales}
      defaultLocale={locales.defaultLocale}
      canCreate={ws.canEdit}
    />
  )
}

/** What the screen shows, derived from the document, the site and the viewer */
interface EditorView {
  kind: EditorKind
  /** The collection renders pages: a document of one with `path: false` has no Live mode */
  hasPage: boolean
  modes: readonly EditorMode[]
  /** The document's name for the page heading */
  title: string
  siteLink: SiteLink | null
  /** The locale the address asked for, when the document has no version of its own there */
  missingLocale: string | null
  /** The side panel shows beside the canvas: for a page, not a global */
  showPanel: boolean
}

function useEditorView(ws: Workspace, { source, target }: WorkspaceProps): EditorView {
  const caps = useCapabilities()
  const kind: EditorKind = target.collection === LAYOUT_COLLECTION ? 'global' : 'page'
  const meta = ws.document?.meta
  const link = meta
    ? siteLink({
        collection: source.collection,
        slug: meta.slug,
        liveVersion: meta.liveVersion,
        preview: ws.canEdit && isEnabled(caps, 'sitePreview'),
        baseUrl: source.site?.site.baseUrl ?? null,
      })
    : null
  const hasPage = source.collection?.pages ?? false
  return {
    kind,
    hasPage,
    modes: editorModes(kind, hasPage),
    title: meta ? meta.slug : `New ${singularLabel(target.collection)}`,
    siteLink: link,
    missingLocale: meta && target.locale && target.locale !== meta.locale ? target.locale : null,
    showPanel: kind === 'page',
  }
}

interface HeaderSlotProps extends WorkspaceProps {
  ws: Workspace
  view: EditorView
  ids: string
  mode: EditorModeId
  onMode: (mode: EditorModeId) => void
  openDialog: (dialog: Dialog) => void
}

function HeaderSlot({
  ws,
  view,
  ids,
  mode,
  onMode,
  openDialog,
  source,
}: HeaderSlotProps): ReactElement {
  const meta = ws.document?.meta
  const record = meta
    ? { status: meta.status, createdAt: meta.createdAt, changedBy: meta.changedBy }
    : null
  return (
    <EditorHeader
      modes={view.modes}
      mode={mode}
      onMode={onMode}
      tabId={(id) => `${ids}-mode-${id}`}
      panelId={`${ids}-canvas`}
      facts={ws.facts}
      saving={ws.actions.busy === 'save'}
      record={record}
      lock={ws.lock}
      locales={<Locales ws={ws} source={source} />}
      siteLink={view.siteLink}
      onSave={() => void ws.actions.save()}
      onPublish={() => openDialog({ kind: 'publish' })}
      onStatusChange={
        meta && !ws.readOnly ? (change) => openDialog({ kind: 'status', change }) : null
      }
    />
  )
}

/**
 * The open mode, from the address (`?mode=`): switching replaces the entry,
 * keeping the locale, so Back leaves the document rather than stepping through
 * modes. A new document, or one whose collection renders no pages, opens in Structure mode
 */
function useMode(
  kind: EditorKind,
  context: ModeContext,
): [EditorModeId, (mode: EditorModeId) => void] {
  const [params, setParams] = useSearchParams()
  const mode = modeFromParam(params.get(MODE_PARAM), kind, context)
  const setMode = useCallback(
    (next: EditorModeId) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          updated.set(MODE_PARAM, next)
          return updated
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [mode, setMode]
}

function EditorWorkspace(props: WorkspaceProps): ReactElement {
  const ws = useWorkspace(props.source, props.target)
  const view = useEditorView(ws, props)
  const isNew = props.target.slug === undefined
  const [mode, setMode] = useMode(view.kind, { isNew, hasPage: view.hasPage })
  const [dialog, setDialog] = useState<Dialog>(null)
  const ids = useId()
  const rootRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  useFocusOnOpen(rootRef)
  const close = useCallback(() => setDialog(null), [])
  const slot = { ...props, ws, view, ids, mode }
  return (
    <section ref={rootRef} className="editor" tabIndex={-1} aria-labelledby={`${ids}-title`}>
      <h1 id={`${ids}-title`} className="visually-hidden">
        {view.title}
      </h1>
      <HeaderSlot {...slot} onMode={setMode} openDialog={setDialog} />
      <EditorNotices
        workspace={ws}
        missingLocale={view.missingLocale}
        onAnswered={() => canvasRef.current?.focus()}
      />
      {view.kind === 'page' && mode !== 'data' && ws.document && (
        <HistoryCard
          timeline
          collection={ws.document.meta.collection}
          slug={ws.document.meta.slug}
          locale={ws.document.meta.locale}
          saved={{ version: ws.document.meta.version, liveVersion: ws.document.meta.liveVersion }}
          draft={ws.draft.draft}
          unsaved={ws.draft.dirty}
          canRestore={ws.isAdmin && !ws.readOnly}
          onRestored={ws.reloadDocument}
          onPrepare={ws.prepareSnapshot}
        />
      )}
      <EditorColumns
        ws={ws}
        kind={view.kind}
        source={props.source}
        collection={props.target.collection}
        ids={ids}
        mode={mode}
        onMode={setMode}
        showPanel={view.showPanel}
        canvasRef={canvasRef}
      />
      <Dialogs ws={ws} hasPage={view.hasPage} dialog={dialog} close={close} />
    </section>
  )
}

function EditorSkeleton(): ReactElement {
  return (
    <div className="editor" aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading the document…
      </p>
      <div className="editor-header editor-skeleton" aria-hidden="true" />
      <div
        className="editor-structure editor-skeleton editor-skeleton--canvas"
        aria-hidden="true"
      />
    </div>
  )
}

function EditorScreen({ target }: { target: EditorTarget }): ReactElement {
  const { loaded, reload } = useEditorSource(target)
  if (loaded.state === 'loading') return <EditorSkeleton />
  if (loaded.state === 'error') {
    return (
      <LoadError title="The document could not load" message={loaded.message} onRetry={reload} />
    )
  }
  if (!loaded.data) return <NotFound />
  return <EditorWorkspace source={loaded.data} target={target} />
}

/**
 * The editor: `/site/:collection/:slug`, `/new/:collection`, and `/layout/:slug`
 * for a global, where `collection` is fixed. `?locale=` opens another locale's version.
 */
export function EditorPage({
  collection: fixed,
}: {
  collection?: string | undefined
}): ReactElement {
  const params = useParams<{ collection: string; slug: string }>()
  const [searchParams] = useSearchParams()
  const collection = fixed ?? params.collection
  const locale = searchParams.get('locale') ?? undefined
  if (!collection) return <NotFound />
  const { slug } = params
  // Another document or locale opens a fresh editor: its own draft, lock and kept work
  return (
    <EditorScreen
      key={`${collection}/${slug ?? ''}/${locale ?? ''}`}
      target={{ collection, slug, locale }}
    />
  )
}
