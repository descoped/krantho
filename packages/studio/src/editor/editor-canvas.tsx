import { Lock, LockOpen, PanelRightOpen } from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { IconButton } from '../ui/button.js'
import { ResizeHandle } from '../ui/resize-handle.js'
import { DataMode } from './data-mode/data-mode.js'
import { WhereItAppears } from './globals-editor.js'
import type { LiveFound } from './live-marks.js'
import { LiveMode } from './live-mode.js'
import { livePreview } from './live-preview.js'
import type { EditorKind, EditorModeId } from './modes.js'
import { SharedDefaults } from './shared-defaults.js'
import type { PanelDocument } from './side-panel/panel-document.js'
import { NOTHING_SELECTED, selectionAtCaret } from './side-panel/selection.js'
import { SidePanel } from './side-panel/side-panel.js'
import { type PanelSelectionControl, usePanelSelection } from './side-panel/use-panel-selection.js'
import { StructureMode } from './structure-mode.js'
import type { EditorSource } from './use-editor-source.js'
import { PANEL_WIDTH, usePanelLayout } from './use-panel-layout.js'
import type { Workspace } from './use-workspace.js'

/** Why the form cannot be edited, or null when it can */
function readOnlyReason(ws: Workspace): string | null {
  if (!ws.readOnly) return null
  if (ws.creating) return 'Creating the document…'
  if (!ws.canEdit) return 'Read-only: your role can view documents but not edit them.'
  const holder = ws.facts.lockedBy ?? 'Someone else'
  return `Read-only: ${holder} is editing. Saving and publishing wait until they finish or the lock expires.`
}

/** Whether focus was lost (on the page itself, or on a disabled or removed control) or sits in the canvas */
function focusBelongsHere(notice: HTMLElement | null): boolean {
  const active = document.activeElement
  const lost = !active || active === document.body || active.matches(':disabled')
  return lost || Boolean(notice?.closest('.editor-canvas')?.contains(active))
}

/**
 * Whether the form just opened again because someone else's lock let go:
 * said until the next change to the form
 */
function useReopened(foreign: boolean, draft: unknown): boolean {
  const [reopened, setReopened] = useState(false)
  const was = useRef(foreign)
  useEffect(() => {
    if (was.current && !foreign) setReopened(true)
    if (foreign) setReopened(false)
    was.current = foreign
  }, [foreign])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change to the form ends the news
  useEffect(() => setReopened(false), [draft])
  return reopened
}

/**
 * Says in the canvas why the form is read-only — a status region, always in
 * the page, so a lock that turns foreign while someone types is announced, and
 * so is the form opening again. On either turn, focus that was lost or sat in
 * the canvas moves here rather than staying on a disabled or removed control.
 */
function ReadOnlyNotice({ ws }: { ws: Workspace }): ReactElement {
  const reason = readOnlyReason(ws)
  const reopened = useReopened(ws.facts.lockedBy !== null, ws.draft.draft)
  const ref = useRef<HTMLParagraphElement>(null)
  const was = useRef(ws.readOnly)
  useEffect(() => {
    const turned = ws.readOnly !== was.current
    was.current = ws.readOnly
    if (turned && !ws.creating && focusBelongsHere(ref.current)) ref.current?.focus()
  }, [ws.readOnly, ws.creating])
  const text = reason ?? (reopened ? 'Editing is open again.' : null)
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className={text ? 'editor-readonly' : 'editor-readonly editor-readonly--empty'}
    >
      {reason && <Lock className="editor-notice-icon" aria-hidden="true" />}
      {reopened && !reason && <LockOpen className="editor-notice-icon" aria-hidden="true" />}
      {text}
    </p>
  )
}

interface CanvasProps {
  initialGraphOpen?: boolean | undefined
  onOpenGraph?: (() => void) | undefined
  ws: Workspace
  kind: EditorKind
  mode: EditorModeId
  source: EditorSource
  collection: string
  control: PanelSelectionControl
  onMode: (mode: EditorModeId) => void
  onFound: (found: LiveFound | null) => void
}

/** Live mode on the document's draft preview, when the site renders one for this viewer */
function LiveCanvas(props: CanvasProps): ReactElement {
  const { ws, source, collection, control, onMode, onFound } = props
  const caps = useCapabilities()
  const meta = ws.document?.meta
  const slug = meta?.slug ?? null
  const preview = livePreview({
    collection: source.collection,
    slug,
    locale: meta?.locale ?? null,
    defaultLocale: source.locales?.defaultLocale ?? null,
    sitePreview: isEnabled(caps, 'sitePreview'),
    canEdit: ws.canEdit,
  })
  return (
    <LiveMode
      preview={preview}
      collection={collection}
      slug={slug}
      schema={ws.schema}
      draft={ws.draft.draft}
      designed={source.collection?.sections ?? []}
      readOnly={ws.readOnly}
      savedVersion={meta?.version ?? null}
      selection={control.selection}
      onField={ws.setField}
      onBody={ws.draft.setBody}
      onSelect={control.select}
      onFound={onFound}
      onStructure={() => onMode('structure')}
    />
  )
}

function Canvas(props: CanvasProps): ReactElement {
  const { ws, kind, mode, source, control } = props
  const { select } = control
  const caps = useCapabilities()
  const { document, draft } = ws
  const renders = source.collection?.pages ?? false
  if (mode === 'live') return <LiveCanvas {...props} />
  if (mode === 'data')
    return <DataMode ws={ws} source={source} initialGraphOpen={props.initialGraphOpen} />
  if (mode === 'where') return <WhereItAppears ws={ws} />
  return (
    <StructureMode
      kind={kind}
      schema={ws.schema}
      draft={draft.draft}
      openedFields={ws.openedFields}
      newSlug={document ? null : ws.newSlug}
      readOnly={ws.readOnly}
      fieldErrors={ws.actions.failure?.fieldErrors ?? {}}
      seoReadsFields={kind === 'page' && renders && isEnabled(caps, 'seo')}
      canPromote={ws.isAdmin && !ws.readOnly}
      onField={ws.setField}
      onBody={draft.setBody}
      onMetadata={draft.setMetadata}
      defaults={document?.defaults}
      groupActions={(slot) => <SharedDefaults ws={ws} slot={slot} />}
      onOpenData={props.onOpenGraph}
      onPromote={ws.promote}
      onSelectField={(name) => select({ kind: 'field', name })}
      onCaret={(body, caret) => select(selectionAtCaret(body, caret))}
    />
  )
}

export interface EditorColumnsProps {
  ws: Workspace
  kind: EditorKind
  source: EditorSource
  collection: string
  /** The prefix of the screen's ids, which ties the canvas to the mode tabs */
  ids: string
  mode: EditorModeId
  /** Switch the mode: from the panel, the graph link in Metadata and an advice's Edit */
  onMode: (mode: EditorModeId) => void
  showPanel: boolean
  canvasRef: RefObject<HTMLDivElement | null>
}

/** What the side panel reads of the open document, and the edits it makes through the form */
function panelDocument(
  ws: Workspace,
  source: EditorSource,
  collection: string,
  seoReadsFields: boolean,
  live: LiveFound | null,
): PanelDocument {
  return {
    collection,
    info: source.collection,
    schema: ws.schema,
    onMetadata: ws.draft.setMetadata,
    defaults: ws.document?.defaults ?? [],
    fieldErrors: ws.actions.failure?.fieldErrors ?? {},
    draft: ws.draft.draft,
    meta: ws.document?.meta ?? null,
    limits: source.site?.seo.limits ?? null,
    locales: source.locales,
    readOnly: ws.readOnly,
    canEdit: ws.canEdit,
    seoReadsFields,
    live,
    onField: ws.setField,
    onBody: ws.draft.setBody,
  }
}

/** Focus a field's control in Structure mode */
function focusFieldIn(canvas: HTMLElement | null, name: string): void {
  const row = canvas?.querySelector(`[data-field="${name.replace(/["\\]/g, '\\$&')}"]`)
  row?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
}

/**
 * The panel's ways into the canvas: Edit of an advice focuses the field in
 * Structure mode, switching to it first; the graph link in Metadata switches to
 * Data mode and its tab takes focus, so focus is never lost
 */
function usePanelLinks(props: EditorColumnsProps): {
  editField: (name: string) => void
  openData: (() => void) | null
} {
  const { mode, onMode, ids, canvasRef } = props
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (mode !== 'structure' || pending.current === null) return
    focusFieldIn(canvasRef.current, pending.current)
    pending.current = null
  }, [mode, canvasRef])
  const editField = useCallback(
    (name: string) => {
      if (mode === 'structure') {
        focusFieldIn(canvasRef.current, name)
        return
      }
      pending.current = name
      onMode('structure')
    },
    [mode, onMode, canvasRef],
  )
  const openData = useCallback(() => {
    onMode('data')
    requestAnimationFrame(() => document.getElementById(`${ids}-mode-data`)?.focus())
  }, [onMode, ids])
  return { editField, openData: mode === 'data' ? null : openData }
}

/** The canvas beside the side panel; below 1100px the panel stacks under it */
export function EditorColumns(props: EditorColumnsProps): ReactElement {
  const { ws, ids, mode, showPanel, canvasRef } = props
  const control = usePanelSelection()
  const links = usePanelLinks(props)
  const [graphRequested, setGraphRequested] = useState(false)
  useEffect(() => {
    if (mode !== 'data') setGraphRequested(false)
  }, [mode])
  const openGraph = (): void => {
    setGraphRequested(true)
    props.onMode('data')
  }
  const [found, setFound] = useState<LiveFound | null>(null)
  const seo = isEnabled(useCapabilities(), 'seo')
  const seoReadsFields = seo && props.kind === 'page' && (props.source.collection?.pages ?? false)
  // What Live mode found on the page counts only while Live mode is open
  const live = mode === 'live' ? found : null
  const doc = panelDocument(ws, props.source, props.collection, seoReadsFields, live)
  // Esc in the canvas returns the panel to the page overview; focus stays where it is
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (!event.currentTarget.contains(event.target as Node)) return
    control.select(NOTHING_SELECTED)
  }
  const layout = usePanelLayout()
  const panelId = `${ids}-panel`
  // The button that replaces the one pressed takes focus, so it is never lost
  function collapse(collapsed: boolean): void {
    layout.setCollapsed(collapsed)
    requestAnimationFrame(() =>
      document.getElementById(`${panelId}-${collapsed ? 'show' : 'hide'}`)?.focus(),
    )
  }
  const columns = ['editor-columns']
  if (!showPanel) columns.push('editor-columns--single')
  else if (layout.collapsed) columns.push('editor-columns--collapsed')
  return (
    <div
      className={columns.join(' ')}
      style={{ '--panel-width': `${layout.width}px` } as CSSProperties}
    >
      <div
        ref={canvasRef}
        id={`${ids}-canvas`}
        role="tabpanel"
        aria-labelledby={`${ids}-mode-${mode}`}
        className="editor-canvas"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <ReadOnlyNotice ws={ws} />
        <Canvas
          {...props}
          control={control}
          onFound={setFound}
          initialGraphOpen={graphRequested}
          onOpenGraph={openGraph}
        />
      </div>
      {showPanel && layout.collapsed && (
        <IconButton
          id={`${panelId}-show`}
          className="editor-panel-show"
          icon={PanelRightOpen}
          label="Show side panel"
          aria-expanded="false"
          onClick={() => collapse(false)}
        />
      )}
      {showPanel && !layout.collapsed && (
        <div className="editor-side">
          <ResizeHandle
            label="Resize side panel"
            value={layout.width}
            min={PANEL_WIDTH.min}
            max={PANEL_WIDTH.max}
            grows="left"
            onChange={layout.setWidth}
            onReset={() => layout.setWidth(PANEL_WIDTH.fallback)}
            controls={panelId}
          />
          <SidePanel
            id={panelId}
            onCollapse={() => collapse(true)}
            doc={doc}
            mode={mode}
            control={control}
            onEditField={links.editField}
            onOpenData={links.openData}
            onOpenGraph={openGraph}
            groupActions={(slot) => <SharedDefaults ws={ws} slot={slot} />}
          />
        </div>
      )}
    </div>
  )
}
