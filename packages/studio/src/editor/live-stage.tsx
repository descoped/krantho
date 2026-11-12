import { lazy, type ReactElement, Suspense, useCallback, useRef, useState } from 'react'
import type { LiveEditing } from './live-editing.js'
import type { Size } from './live-geometry.js'
import { InPlaceEditor } from './live-in-place-editor.js'
import { type Box, type FoundMark, isMultiline, type MarkTarget, markKey } from './live-marks.js'
import type { LiveModeProps } from './live-mode.js'
import { InlineEditor, Outline, type OutlineState } from './live-overlay.js'
import { type PlacedPlaceholder, PlaceholderMarkers } from './live-placeholders.js'
import { elementsOf } from './live-sections.js'
import type { LiveFrame } from './use-live-frame.js'

const LiveMarkdownEditor = lazy(() =>
  import('./live-markdown-editor.js').then((module) => ({ default: module.LiveMarkdownEditor })),
)

export interface LayerProps {
  frame: LiveFrame
  body: string
  designed: readonly string[]
  hovered: FoundMark | null
  selected: MarkTarget | null
  placed: readonly PlacedPlaceholder[]
  size: Size
  /** The inline editor's box, which the tags keep clear of */
  editor: Box | null
  /** The selected element is being edited in the page itself */
  inPlace: boolean
}

/** Studio's layer over the frame: outlines and tags, and the markers of missing sections */
export function LiveLayer(props: LayerProps) {
  const { frame, body, designed, hovered, selected, placed, size, editor, inPlace } = props
  const outline = (target: MarkTarget, elements: readonly Element[], state: OutlineState) => (
    <Outline
      target={target}
      elements={elements}
      designed={designed}
      state={state}
      layer={size}
      avoid={editor}
    />
  )
  return (
    <div className="live-layer" aria-hidden="true">
      <PlaceholderMarkers placed={placed} layer={size} />
      {hovered &&
        !(inPlace && selected && markKey(hovered.target) === markKey(selected)) &&
        outline(hovered.target, [hovered.element], 'hovered')}
      {selected &&
        outline(
          selected,
          elementsOf(frame.marks, selected, body),
          inPlace ? 'editing' : 'selected',
        )}
    </div>
  )
}

export interface StageProps {
  props: LiveModeProps
  frame: LiveFrame
  title: string
  hovered: FoundMark | null
  editing: LiveEditing
  placed: readonly PlacedPlaceholder[]
}

/** The size of the stage as laid out now: the layer's coordinates */
export function stageSize(stage: HTMLElement | null): Size {
  return { width: stage?.clientWidth ?? 0, height: stage?.clientHeight ?? 0 }
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** The inline editor's box in the stage, as it reports it; null while it is closed */
export function useEditorBox(): [Box | null, (box: Box | null) => void] {
  const [box, setBox] = useState<Box | null>(null)
  const place = useCallback((next: Box | null) => {
    setBox((now) => (sameBox(now, next) ? now : next))
  }, [])
  return [box, place]
}

export interface StageEditorProps {
  props: LiveModeProps
  frame: LiveFrame
  editing: LiveEditing
  target: MarkTarget
  stage: HTMLElement | null
  onPlaced: (box: Box | null) => void
}

/**
 * What edits the target: the page's own element, for a plain-text field with
 * one that holds only text; the inline editor at the element for anything else
 */
export function StageEditor({ props, frame, editing, target, stage, onPlaced }: StageEditorProps) {
  const { draft, schema } = props
  const found = elementsOf(frame.marks, target, draft.body)
  const picked = editing.inPlace?.element
  const elements =
    picked && found.includes(picked)
      ? [picked, ...found.filter((element) => element !== picked)]
      : found
  const common = { onField: editing.onField, onPatched: frame.rescan, onClose: editing.close }
  if (target.kind === 'field' && editing.inPlace) {
    const { element, point } = editing.inPlace
    const multiline = isMultiline(target.name, schema)
    const onDismiss = editing.dismiss
    return (
      <InPlaceEditor
        stage={stage}
        onPlaced={onPlaced}
        key={markKey(target)}
        {...{ ...common, name: target.name, element, elements, multiline, point, onDismiss }}
      />
    )
  }
  if (target.kind !== 'field') {
    return (
      <Suspense
        fallback={
          <span className="live-loading" role="status">
            Loading editor…
          </span>
        }
      >
        <LiveMarkdownEditor
          key={markKey(target)}
          {...{ ...common, target, elements, stage, schema, draft, onPlaced }}
          onBody={editing.onBody}
        />
      </Suspense>
    )
  }
  return (
    <InlineEditor
      key={markKey(target)}
      {...{ ...common, target, elements, stage, schema, draft, onPlaced }}
      onBody={editing.onBody}
    />
  )
}

/**
 * The frame and Studio's layer above it, with the editor at the selected
 * element. A reload keeps the editor where it was until the page
 * is back, so typing goes on through a Save.
 */
export function LiveStage({
  props,
  frame,
  title,
  hovered,
  editing,
  placed,
}: StageProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null)
  const [editorBox, placeEditor] = useEditorBox()
  const { draft, designed } = props
  const kind = frame.state.kind
  const target = kind === 'ready' || kind === 'loading' ? editing.editing : null
  const layer = {
    frame,
    body: draft.body,
    designed,
    hovered,
    placed,
    editor: editorBox,
    inPlace: target !== null && (editing.inPlace !== null || target.kind !== 'field'),
  }
  const iframe = { ref: frame.frameRef, title, src: frame.src, onLoad: frame.onLoad }
  return (
    <div ref={stageRef} className="live-stage">
      <iframe key={frame.reload} className="live-frame" {...iframe} />
      {kind === 'ready' && (
        <LiveLayer {...layer} selected={editing.selected} size={stageSize(stageRef.current)} />
      )}
      {target && (
        <StageEditor
          {...{ props, frame, editing, target }}
          stage={stageRef.current}
          onPlaced={placeEditor}
        />
      )}
    </div>
  )
}
