import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CollectionSchema } from '../lib/api-types.js'
import { Button } from '../ui/button.js'
import type { Draft } from './editor-model.js'
import {
  type EditorPlacement,
  editorPlacement,
  elementToolbarPlacement,
  type Size,
  tagPlacement,
} from './live-geometry.js'
import {
  type Box,
  isMultiline,
  type MarkTarget,
  markBox,
  markTag,
  patchText,
} from './live-marks.js'
import { sectionIndexOf } from './live-sections.js'
import { type BodySplice, leadSplice, sectionSplice } from './side-panel/page-sections.js'

/**
 * Live mode's own layer above the preview frame: the outline and tag of the
 * hovered and the selected element, and the inline editor at the selected
 * one. Positioned from the element's box in the frame's viewport — the layer
 * covers the frame exactly — and never written into the site's page.
 */

/** How an outline shows its element: hovered, selected, or selected and being edited in the page itself */
export type OutlineState = 'hovered' | 'selected' | 'editing'

/** An editing outline is a selected one with a stronger ring */
function outlineClass(state: OutlineState): string {
  const base = 'live-outline'
  if (state === 'hovered') return base
  return state === 'selected'
    ? `${base} ${base}--selected`
    : `${base} ${base}--selected ${base}--editing`
}

/**
 * An outline around the elements that render a mark, with its tag: a ring of
 * two contrasting tones, so it shows on any page, and no fill, so the
 * element's text stays visible. The tag keeps its full text as its title, and
 * is never placed under the inline editor (`avoid`).
 */
export function Outline({
  target,
  elements,
  designed,
  state,
  layer,
  avoid,
}: {
  target: MarkTarget
  elements: readonly Element[]
  designed: readonly string[]
  state: OutlineState
  /** The layer's size: the tag is kept inside it */
  layer: Size
  /** The inline editor's box in the layer, which the tag keeps clear of; null when it is closed */
  avoid: Box | null
}): ReactElement {
  const boxes = elements.map(markBox).filter((box): box is Box => box !== null)
  const tag = markTag(target, designed)
  const className = outlineClass(state)
  return (
    <>
      {boxes.map((box, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: one box per element, in page order
          key={index}
          className={className}
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        >
          {index === 0 && state !== 'editing' && (
            <Tag box={box} layer={layer} text={tag} avoid={avoid} />
          )}
        </div>
      ))}
    </>
  )
}

/** The outline's tag, where the open inline editor leaves room for it */
function Tag(props: {
  box: Box
  layer: Size
  text: string
  avoid: Box | null
}): ReactElement | null {
  const placement = tagPlacement(props.box, props.layer, props.text, props.avoid)
  if (!placement) return null
  return (
    <span className="live-tag" title={props.text} style={placement}>
      {props.text}
    </span>
  )
}

/** The content's name in the editors that open on it */
export function contentLabel(target: MarkTarget): string {
  if (target.kind === 'lead') return 'Introduction'
  if (target.kind === 'section') return `${target.heading} section`
  if (target.name === 'title') return 'Page title'
  const words = target.name.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How the inline editor is named: after the field or section it edits */
export function editorLabel(target: MarkTarget): string {
  if (target.kind === 'field') return `Edit field ${target.name}`
  if (target.kind === 'lead') return 'Edit the lead'
  return `Edit section ${target.heading}`
}

export interface InlineEditorProps {
  target: MarkTarget
  /** The elements that render it, patched as the person types */
  elements: readonly Element[]
  stage: HTMLElement | null
  schema: CollectionSchema
  draft: Draft
  onField: (name: string, value: unknown) => void
  onBody: (body: string) => void
  /** The page was patched: its marks are read again */
  onPatched: () => void
  /** Close the editor: Esc or Done; focus returns to where it was */
  onClose: () => void
  /** Where the editor is in the stage, for the tag to keep clear of; null once it closes */
  onPlaced: (box: Box | null) => void
}

/** A field's text, typed into the draft and the page at once */
function FieldInput({ props, id }: { props: InlineEditorProps; id: string }): ReactElement | null {
  const { target, draft, schema, elements, onField, onPatched } = props
  if (target.kind !== 'field') return null
  const raw = draft.fields[target.name]
  const value = typeof raw === 'string' ? raw : ''
  const onChange = (next: string): void => {
    onField(target.name, next)
    patchText(elements, next)
    onPatched()
  }
  if (isMultiline(target.name, schema)) {
    return (
      <textarea
        id={id}
        className="editor-control editor-control--area"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <input
      id={id}
      className="editor-control"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** The section or the lead opened from the body; null for a section it cannot find or tell apart */
export function openSplice(target: MarkTarget, body: string): BodySplice | null {
  if (target.kind === 'lead') return leadSplice(body)
  const index = sectionIndexOf(body, target)
  return index === null ? null : sectionSplice(body, index)
}

/** The editor's own size as laid out — its whole content, even while it scrolls — measured again when it resizes */
export function useMeasuredSize(ref: { current: HTMLElement | null }): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [, resized] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const frame = element.offsetHeight - element.clientHeight
    const next = { width: element.offsetWidth, height: element.scrollHeight + frame }
    if (next.width !== size.width || next.height !== size.height) setSize(next)
  })
  // The stage resizing changes the editor's size, and what it holds wraps again, without a render
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => resized((n) => n + 1))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/**
 * The editor's place: at its element, or where it last was while the element
 * has no box — the frame reloading after Save — reported to the layer
 */
export function usePlacement(
  props: Pick<InlineEditorProps, 'elements' | 'stage' | 'onPlaced' | 'target'> & {
    toolbar?: boolean | undefined
  },
  size: Size,
): EditorPlacement {
  const { elements, stage, onPlaced } = props
  const last = useRef<EditorPlacement | null>(null)
  const first = elements[0]
  const box = first ? markBox(first) : null
  const stageSize = { width: stage?.clientWidth ?? 0, height: stage?.clientHeight ?? 0 }
  // A section's editor is as wide as its element; a field's keeps its own width
  const fit = props.target.kind !== 'field'
  const place = props.toolbar
    ? elementToolbarPlacement(box, stageSize, size)
    : editorPlacement(box, stageSize, size, fit)
  const at = box || !last.current ? place : last.current
  last.current = at
  const height = at.maxHeight ?? size.height
  const width = at.width ?? size.width
  useLayoutEffect(() => {
    onPlaced({ top: at.top, left: at.left, width, height })
  }, [onPlaced, at.top, at.left, width, height])
  useLayoutEffect(() => () => onPlaced(null), [onPlaced])
  return at
}

/**
 * The inline editor, placed at the element and always whole inside the
 * stage: an input for a text field the page does not let be edited where
 * it stands (`InPlaceEditor`). It takes focus when it
 * opens; Esc or Done closes it.
 */
export function InlineEditor(props: InlineEditorProps): ReactElement {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const { target, onClose } = props
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
  }, [])
  const at = usePlacement(props, useMeasuredSize(ref))
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }
  const style = {
    top: at.top,
    left: at.left,
    width: at.width ?? undefined,
    maxHeight: at.maxHeight ?? undefined,
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc anywhere in the editor closes it
    <div ref={ref} className="live-editor" style={style} onKeyDown={onKeyDown}>
      <label htmlFor={id} className="live-editor-label">
        {editorLabel(target)}
      </label>
      <FieldInput props={props} id={id} />
      <div className="live-editor-actions">
        <span className="side-note">Saved with the draft.</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
