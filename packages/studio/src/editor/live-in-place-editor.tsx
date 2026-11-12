import { Check, X } from 'lucide-react'
import { type ReactElement, useEffect, useRef } from 'react'
import { IconButton } from '../ui/button.js'
import { type Point, startInPlace } from './live-in-place.js'
import { type Box, patchText } from './live-marks.js'
import { contentLabel, editorLabel, useMeasuredSize, usePlacement } from './live-overlay.js'

export interface InPlaceEditorProps {
  /** The preview’s viewport, where contextual controls are placed */
  stage: HTMLElement | null
  onPlaced: (box: Box | null) => void
  /** The field being edited */
  name: string
  /** The element it is edited on, in the frame's page */
  element: HTMLElement
  /** Every element that renders the field: the others are patched as the person types */
  elements: readonly Element[]
  /** The field is a textarea in the form: it takes line breaks */
  multiline: boolean
  /** Where the click landed; null puts the caret at the end */
  point: Point | null
  onField: (name: string, value: unknown) => void
  /** The page was patched: its marks are read again */
  onPatched: () => void
  /** Enter in a one-line field, or Esc: finished, focus returning to where it was */
  onClose: () => void
  /** Focus left the element: finished, focus staying where it went */
  onDismiss: () => void
}

/**
 * A plain-text field edited in the page itself: while this is mounted the
 * element is editable and holds focus, and every change to its text is the
 * field's value in the draft, patched into the page's other renderings of it.
 * Contextual controls sit beside it; unmounting gives the element back as the
 * site rendered it.
 */
export function InPlaceEditor(props: InPlaceEditorProps): ReactElement {
  const controls = useRef<HTMLFieldSetElement>(null)
  const target = { kind: 'field', name: props.name } as const
  const at = usePlacement(
    { ...props, target, elements: [props.element], toolbar: true },
    useMeasuredSize(controls),
  )
  const latest = useRef(props)
  latest.current = props
  const { name, element, multiline, point } = props
  const original = useRef(element.textContent ?? '')
  useEffect(() => {
    return startInPlace(element, {
      label: editorLabel({ kind: 'field', name }),
      multiline,
      point,
      onText: (text) => {
        const { elements, onField, onPatched } = latest.current
        onField(name, text)
        // The edited element holds the text already: setting it again would move the caret
        patchText(
          elements.filter((other) => other !== element),
          text,
        )
        onPatched()
      },
      onClose: () => latest.current.onClose(),
      onDismiss: () => {
        if (!controls.current?.contains(document.activeElement)) latest.current.onDismiss()
      },
    })
  }, [name, element, multiline, point])
  const cancel = (): void => {
    props.onField(name, original.current)
    patchText(props.elements, original.current)
    props.onPatched()
    props.onClose()
  }
  return (
    <fieldset
      ref={controls}
      className="live-context"
      aria-label={`Editing ${contentLabel(target)}`}
      style={{
        top: at.top,
        left: at.left,
        width: at.width ?? undefined,
        maxHeight: at.maxHeight ?? undefined,
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        props.onClose()
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        const frame = element.ownerDocument.defaultView?.frameElement
        if (event.relatedTarget === frame && element.ownerDocument.activeElement === element) return
        props.onDismiss()
      }}
    >
      <div>
        <strong>{contentLabel(target)}</strong>
        <span className="side-note">Draft</span>
      </div>
      <div className="live-context-actions">
        <IconButton
          icon={X}
          label="Cancel this element’s edit"
          className="live-context-cancel"
          size="sm"
          onPointerDown={(event) => event.preventDefault()}
          onClick={cancel}
        />
        <IconButton
          icon={Check}
          label="Done editing"
          className="live-context-done"
          size="sm"
          onPointerDown={(event) => event.preventDefault()}
          onClick={props.onClose}
        />
      </div>
    </fieldset>
  )
}
