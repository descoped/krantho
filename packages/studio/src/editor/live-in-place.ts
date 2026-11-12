import { generatesNoBox } from './live-marks.js'

/**
 * Editing a plain-text field in the preview frame itself: the marked element
 * becomes editable while it is edited, from the parent like everything Live
 * mode does to the page, and is as the site rendered it — plus the typed text
 * — once it is finished. Pure DOM logic on the frame's document; the React
 * side is `InPlaceEditor` (`live-in-place-editor.tsx`).
 */

/** Where a click landed, in the frame's viewport */
export interface Point {
  readonly x: number
  readonly y: number
}

const TEXT_NODE = 3
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'
/** Elements that show something other than their text: they cannot be typed into */
const REPLACED = new Set([
  'img',
  'input',
  'textarea',
  'select',
  'video',
  'audio',
  'canvas',
  'iframe',
  'object',
  'embed',
])

/**
 * Whether a field can be edited on this element: an HTML element with a box
 * of its own whose content is only text, so that typing into it loses no
 * markup. Any other element keeps the floating editor.
 */
export function editableInFrame(element: Element): element is HTMLElement {
  if (element.namespaceURI !== HTML_NAMESPACE || REPLACED.has(element.localName)) return false
  if (generatesNoBox(element)) return false
  return [...element.childNodes].every((node) => node.nodeType === TEXT_NODE)
}

/** The element's text as typed */
function textOf(element: Element): string {
  return element.textContent ?? ''
}

interface CaretSource {
  caretPositionFromPoint?: Document['caretPositionFromPoint']
  caretRangeFromPoint?: Document['caretRangeFromPoint']
}

/** The text position under a point, by whichever of the two lookups the browser has */
function caretAt(doc: Document, point: Point): { node: Node; offset: number } | null {
  const source: CaretSource = doc
  const position = source.caretPositionFromPoint?.(point.x, point.y)
  if (position) return { node: position.offsetNode, offset: position.offset }
  const range = source.caretRangeFromPoint?.(point.x, point.y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

/** The caret at the click point when it is in the element, else at the end of its text */
function placeCaret(element: HTMLElement, point: Point | null): void {
  const doc = element.ownerDocument
  const selection = doc.getSelection()
  if (!selection) return
  const range = doc.createRange()
  const at = point ? caretAt(doc, point) : null
  if (at && element.contains(at.node)) {
    range.setStart(at.node, at.offset)
    range.collapse(true)
  } else {
    range.selectNodeContents(element)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

/** An attribute set for the time of the edit: the returned function puts it back as the site had it */
function setAttribute(element: Element, name: string, value: string): () => void {
  const was = element.getAttribute(name)
  element.setAttribute(name, value)
  return () => (was === null ? element.removeAttribute(name) : element.setAttribute(name, was))
}

/** Plain text only where the browser knows `plaintext-only`; it reads an unknown value back as `inherit` */
function makeEditable(element: HTMLElement): { plain: boolean; restore: () => void } {
  const restore = setAttribute(element, 'contenteditable', 'plaintext-only')
  if (element.contentEditable !== 'inherit') return { plain: true, restore }
  element.setAttribute('contenteditable', 'true')
  return { plain: false, restore }
}

/** Line breaks show while a multi-line field is edited; the inline style goes when the edit does */
function showLineBreaks(element: HTMLElement): () => void {
  element.style.setProperty('white-space', 'pre-wrap')
  return () => {
    element.style.removeProperty('white-space')
    if (element.getAttribute('style') === '') element.removeAttribute('style')
  }
}

/** The element's accessible name and role while it is edited: a text box named after the field */
function nameEditor(element: Element, label: string, multiline: boolean): () => void {
  const restores = [
    setAttribute(element, 'role', 'textbox'),
    setAttribute(element, 'aria-label', label),
    setAttribute(element, 'aria-multiline', String(multiline)),
  ]
  return () => {
    for (const restore of restores) restore()
  }
}

/**
 * Text typed at the caret. Where the browser keeps the element to plain text
 * it is inserted as a person typing would, undoable; otherwise it goes in as
 * one text node, so a line break is a character and never an element.
 */
function insertText(
  element: HTMLElement,
  text: string,
  how: { plain: boolean; onText: (text: string) => void },
): void {
  const doc = element.ownerDocument
  const legacy: Partial<Pick<Document, 'execCommand'>> = doc
  if (how.plain && legacy.execCommand?.('insertText', false, text)) return
  const selection = doc.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = doc.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  how.onText(textOf(element))
}

/** What happens while the element is edited, reported to Live mode */
export interface InPlaceOptions {
  /** The element's accessible name while it is edited */
  label: string
  /** The field takes line breaks */
  multiline: boolean
  /** Where the click landed; null puts the caret at the end */
  point: Point | null
  /** The element's text changed */
  onText: (text: string) => void
  /** Enter in a one-line field, or Esc: finished, and focus returns to where it was */
  onClose: () => void
  /** Focus left the element: finished, and focus stays where it went */
  onDismiss: () => void
}

/** A paste as plain text, on one line where the field is one line */
function pastedText(event: Event, multiline: boolean): string | null {
  const data = (event as ClipboardEvent).clipboardData?.getData('text/plain')
  if (data === undefined) return null
  return multiline ? data.replace(/\r\n?/g, '\n') : data.replace(/\s*[\r\n]+\s*/g, ' ')
}

/** Whether focus left for good: it went to another element, or to Studio — not out of the window */
function focusLeft(element: HTMLElement): boolean {
  return element.ownerDocument.activeElement !== element || document.hasFocus()
}

/** The listeners of an edit: typing, Enter, Esc, paste, drop and focus leaving */
function listen(
  element: HTMLElement,
  plain: boolean,
  options: InPlaceOptions,
): { stop: () => void } {
  const { multiline, onText, onClose, onDismiss } = options
  let pending: ReturnType<typeof setTimeout> | undefined
  const handlers: Record<string, (event: Event) => void> = {
    input: () => onText(textOf(element)),
    keydown: (event) => {
      const key = event as KeyboardEvent
      const enter = key.key === 'Enter' && !key.isComposing
      if (key.key !== 'Escape' && !enter) return
      // A line break in a multi-line field is the browser's own, where it keeps to plain text
      if (enter && multiline && plain) return
      // Esc in the page would clear the selection without moving focus: it is the editor's here
      key.preventDefault()
      key.stopPropagation()
      if (key.key === 'Escape' || !multiline) onClose()
      else insertText(element, '\n', { plain, onText })
    },
    paste: (event) => {
      const text = pastedText(event, multiline)
      if (text === null) return
      event.preventDefault()
      insertText(element, text, { plain, onText })
    },
    drop: (event) => event.preventDefault(),
    blur: () => {
      // Whether focus left the window or the element is only known once focus has settled
      pending = setTimeout(() => {
        if (focusLeft(element)) onDismiss()
      })
    },
  }
  for (const [type, handler] of Object.entries(handlers)) element.addEventListener(type, handler)
  return {
    stop: () => {
      clearTimeout(pending)
      for (const [type, handler] of Object.entries(handlers)) {
        element.removeEventListener(type, handler)
      }
    },
  }
}

/**
 * Make the element editable and take focus in it, the caret at the click or
 * at the end. Returns the way to finish: the element goes back to what the
 * site rendered, its text as typed, and loses focus if it still has it.
 */
export function startInPlace(element: HTMLElement, options: InPlaceOptions): () => void {
  const { plain, restore } = makeEditable(element)
  const undo = [restore, nameEditor(element, options.label, options.multiline)]
  if (options.multiline) undo.push(showLineBreaks(element))
  const listening = listen(element, plain, options)
  element.focus({ preventScroll: true })
  placeCaret(element, options.point)
  return () => {
    listening.stop()
    if (element.ownerDocument.activeElement === element) element.blur()
    // Typing can leave markup behind — a placeholder line break — that the page never had
    element.textContent = textOf(element)
    for (const restoreAttribute of undo) restoreAttribute()
  }
}
