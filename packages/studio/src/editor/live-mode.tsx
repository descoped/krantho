import { type ReactElement, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionSchema } from '../lib/api-types.js'
import type { Draft } from './editor-model.js'
import { LiveBar } from './live-bar.js'
import { type LiveEditing, useLiveEditing } from './live-editing.js'
import { failure, LiveEmpty } from './live-empty.js'
import { useFocusKept } from './live-focus.js'
import type { FrameState } from './live-frame-state.js'
import { documentMark, type FoundMark, foundOf, type LiveFound } from './live-marks.js'
import { PlaceholderList, placePlaceholders } from './live-placeholders.js'
import type { LivePreview } from './live-preview.js'
import { placeholderAnchors } from './live-sections.js'
import { addDesignedSection } from './side-panel/page-sections.js'
import type { PanelSelection } from './side-panel/selection.js'
import { useLiveFrame } from './use-live-frame.js'
import './live-mode.css'
import { LiveStage } from './live-stage.js'

export interface LiveModeProps {
  preview: LivePreview
  collection: string
  /** The saved document's slug; null for a document not saved yet */
  slug: string | null
  schema: CollectionSchema
  draft: Draft
  /** The `##` sections the page template designs */
  designed: readonly string[]
  /** Hover and select still work; nothing is typed or patched */
  readOnly: boolean
  /** The saved version: a new one — after Save or Publish — reloads the preview */
  savedVersion: number | null
  /** What the side panel shows: back to nothing selected clears the selected outline */
  selection: PanelSelection
  onField: (name: string, value: unknown) => void
  onBody: (body: string) => void
  onSelect: (selection: PanelSelection, focusPanel?: boolean | undefined) => void
  /** What the scan found on the page; null while there is no scan */
  onFound: (found: LiveFound | null) => void
  onStructure: () => void
}

/** Report what the scan found while the page is shown; nothing once it is not */
function useReportFound(
  state: FrameState,
  marks: readonly FoundMark[],
  onFound: LiveModeProps['onFound'],
): void {
  useEffect(() => {
    onFound(state.kind === 'ready' ? foundOf(marks) : null)
  }, [state, marks, onFound])
  useEffect(() => () => onFound(null), [onFound])
}

/** Add section under the frame: the panel's own insertion, the new section selected */
function addSection(props: LiveModeProps, editing: LiveEditing, name: string): void {
  // The inline editor never writes over a body changed under it: it closes first
  editing.closeFirst()
  const added = addDesignedSection(props.draft.body, props.designed, name)
  props.onBody(added.body)
  props.onSelect({ kind: 'section', heading: name, index: added.index }, true)
}

interface FrameViewProps extends LiveModeProps {
  src: string
  path: string
  documentId: string
  reload: number
  /** Reload the preview, or Back to the page: the frame starts again and takes focus */
  onReload: () => void
  /** Set by `onReload`: focus goes to the frame once it is back */
  focusRequested: RefObject<boolean>
}

/**
 * The frame and what Live mode does with it: the page's hover, click and
 * Esc, the selection and the inline editor — kept through a reload, which
 * starts only the frame again — and focus kept through every change of it.
 * The editor closes, keeping the selection, when the frame leaves the page.
 */
function useLiveView(props: FrameViewProps, container: RefObject<HTMLDivElement | null>) {
  const { src, path, documentId, draft, reload } = props
  const [hovered, setHovered] = useState<FoundMark | null>(null)
  const editing = useLiveEditing(props)
  const frame = useLiveFrame(
    { src, path, documentId, body: draft.body, reload },
    {
      onHover: setHovered,
      // Focus was in the frame: Esc in the inline editor returns it there
      onPick: (mark, point) =>
        editing.pick(mark.target, frame.frameRef.current, { element: mark.element, point }),
      onEscape: editing.dismiss,
      onOutsideClick: editing.dismiss,
    },
  )
  useEffect(() => {
    if (!editing.editing) return
    const dismissOutside = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.live-editor, .live-context') || target === frame.frameRef.current) return
      editing.dismiss()
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [editing.editing, editing.dismiss, frame.frameRef])
  useReportFound(frame.state, frame.marks, props.onFound)
  const gone = frame.state.kind === 'moved' || frame.state.kind === 'failed'
  // A field edited in the page ends with its element: a reload replaces the page
  const edited = editing.inPlace?.element
  const replaced = edited !== undefined && !frame.marks.some((mark) => mark.element === edited)
  const { closeFirst } = editing
  useEffect(() => {
    if (gone || replaced) closeFirst()
  }, [gone, replaced, closeFirst])
  useFocusKept(container, frame, editing.editing !== null, props.focusRequested)
  const ready = frame.state.kind === 'ready'
  return {
    editing,
    frame,
    hovered:
      ready && hovered && frame.marks.some((m) => m.element === hovered.element) ? hovered : null,
  }
}

/** The page in its frame, Studio's layer above it, and the missing designed sections under it */
function LiveFrameView(props: FrameViewProps): ReactElement {
  const { src, documentId, designed, draft, onReload, onStructure } = props
  const container = useRef<HTMLDivElement>(null)
  const { editing, frame, hovered } = useLiveView(props, container)
  if (frame.state.kind === 'failed') {
    const why = failure(frame.state)
    return <LiveEmpty {...why} tried={src} onReload={onReload} onStructure={onStructure} announce />
  }
  const ready = frame.state.kind === 'ready'
  const placed = placePlaceholders(
    ready ? placeholderAnchors(draft.body, designed, frame.marks) : [],
  )
  const title = `Draft preview of ${documentId}`
  return (
    <div ref={container} className="live-mode">
      <LiveBar frame={frame} onReload={onReload} />
      <p className="live-notice side-note" role="status">
        {editing.notice}
      </p>
      <LiveStage {...{ props, frame, title, editing, placed, hovered }} />
      <PlaceholderList
        placed={placed}
        readOnly={props.readOnly}
        onAdd={(name) => addSection(props, editing, name)}
      />
    </div>
  )
}

/**
 * The frame's reload count: a new saved version — Save or Publish — reloads
 * it; so do Reload the preview and Back to the page, which also ask for focus
 * to go to the frame
 */
function useReload(savedVersion: number | null): {
  reload: number
  onReload: () => void
  focusRequested: RefObject<boolean>
} {
  const [reload, setReload] = useState(0)
  const was = useRef(savedVersion)
  const focusRequested = useRef(false)
  useEffect(() => {
    if (was.current !== null && savedVersion !== was.current) setReload((n) => n + 1)
    was.current = savedVersion
  }, [savedVersion])
  const onReload = useCallback(() => {
    focusRequested.current = true
    setReload((n) => n + 1)
  }, [])
  return { reload, onReload, focusRequested }
}

/**
 * Live mode: the site's own draft preview of the page in a same-origin frame,
 * attached from Studio. The document's marked fields and sections outline on
 * hover with their tag; a click selects one in the side panel and opens the
 * inline editor; typing updates the draft and patches the page at once; Save
 * reloads the preview. A page Studio cannot load or read shows the URL it
 * tried and the way to Structure mode — a missing mark never blocks anything.
 */
export function LiveMode(props: LiveModeProps): ReactElement {
  const reload = useReload(props.savedVersion)
  const { preview, slug, onStructure } = props
  if (preview.src === null || slug === null) {
    const title = preview.src === null ? preview.title : 'The document has no page yet'
    const detail = preview.src === null ? preview.detail : 'Save it first.'
    return <LiveEmpty title={title} detail={detail} onStructure={onStructure} />
  }
  return (
    <LiveFrameView
      {...props}
      {...reload}
      src={preview.src}
      path={preview.path}
      documentId={documentMark(props.collection, slug)}
    />
  )
}
