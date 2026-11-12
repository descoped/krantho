import { DOCUMENT_MARK, FIELD_MARK, SECTION_MARK } from '@krantho/core/marks'
import type { RefObject } from 'react'
import { quietly, readQuietly } from './live-frame-state.js'
import type { Point } from './live-in-place.js'
import { type FoundMark, markElementAt, scanMarks } from './live-marks.js'

/**
 * Live mode's hold on the page in the frame, from the parent: it reads the
 * page's marks, reads them again while a client render settles, and listens
 * to hover, clicks, Esc, scrolling and resizing. Nothing is injected into the
 * page, every access is guarded — the page may have gone to another origin —
 * and letting go always finishes.
 */

/** How long after a load the page is watched for marks a client render adds */
const RESCAN_MS = 5_000
/** How long a burst of changes to the page settles before it is read again */
const RESCAN_SETTLE_MS = 50

/** What happens in the page, reported to Live mode */
export interface FrameEvents {
  /** The pointer is over a marked element of the document, or over none */
  onHover: (mark: FoundMark | null) => void
  /** A marked element of the document was clicked (or activated from the keyboard, with no point) */
  onPick: (mark: FoundMark, point: Point | null) => void
  /** Esc was pressed with focus inside the page */
  onEscape: () => void
  /** A click outside the document’s editable content finishes the current edit */
  onOutsideClick: () => void
}

/** Where the attached page reports to */
export interface Attachment {
  doc: Document
  documentId: string
  events: RefObject<FrameEvents>
  /** The page's marks were read: the marks found */
  onMarks: (marks: FoundMark[]) => void
  /** The page's boxes may have moved */
  moved: () => void
  /** Whether the frame still shows the page; when not, it has navigated */
  stillThere: () => boolean
}

/** Read the page again after a burst of changes, for a short while after it loads */
function watchChanges(doc: Document, rescan: () => void): () => void {
  let pending: ReturnType<typeof setTimeout> | undefined
  let observer: MutationObserver | null = null
  quietly(() => {
    const View = doc.defaultView
    if (!View) return
    observer = new View.MutationObserver(() => {
      pending ??= setTimeout(() => {
        pending = undefined
        rescan()
      }, RESCAN_SETTLE_MS)
    })
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [DOCUMENT_MARK, FIELD_MARK, SECTION_MARK],
    })
  })
  const stop = setTimeout(() => quietly(() => observer?.disconnect()), RESCAN_MS)
  return () => {
    clearTimeout(stop)
    if (pending !== undefined) clearTimeout(pending)
    quietly(() => observer?.disconnect())
  }
}

/** A listener added to the page, kept so it can be removed even after the page has gone */
export type Removal = () => void

export function on(
  target: EventTarget | null | undefined,
  type: string,
  listener: (event: Event) => void,
  options: AddEventListenerOptions = {},
): Removal {
  quietly(() => target?.addEventListener(type, listener, options))
  return () => quietly(() => target?.removeEventListener(type, listener, options))
}

/** Where a click landed; none for one the keyboard made, which has no position */
function clickPoint(event: Event): Point | null {
  const click = event as MouseEvent
  return click.detail > 0 ? { x: click.clientX, y: click.clientY } : null
}

/** The listeners Live mode adds to the page */
interface PageHandlers {
  over: (event: Event) => void
  leave: () => void
  click: (event: Event) => void
  key: (event: Event) => void
}

/**
 * The page's handlers: hover reports a change of the marked element only; a
 * click on a marked element is caught first and kept from the page, so a link
 * inside it does not navigate; Esc is reported. Each also notices the page has
 * gone (a client-side navigation) before it acts.
 */
function handlers(at: Attachment, find: (element: Element) => FoundMark | null): PageHandlers {
  let hovered: Element | null = null
  const here = (): boolean => at.stillThere()
  return {
    over: (event: Event): void => {
      if (!here()) return
      const element = markElementAt(event.target, at.documentId)
      if (element === hovered) return
      hovered = element
      at.events.current.onHover(element ? find(element) : null)
    },
    leave: (): void => {
      hovered = null
      at.events.current.onHover(null)
    },
    click: (event: Event): void => {
      if (!here()) return
      // The rich editor owns clicks and selection inside its editing surface.
      if ((event.target as Element | null)?.closest?.('.live-markdown-root')) return
      const element = markElementAt(event.target, at.documentId)
      const mark = element ? find(element) : null
      if (!mark) {
        at.events.current.onOutsideClick()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      at.events.current.onPick(mark, clickPoint(event))
    },
    key: (event: Event): void => {
      if ((event as KeyboardEvent).key === 'Escape') at.events.current.onEscape()
    },
  }
}

/**
 * Attach to the page from the parent: scan it, rescan it on changes for a
 * short while, and listen to it. Every access to the page is guarded — it may
 * have navigated to another origin by the time it is let go — and letting go
 * always finishes.
 */
export function attach(at: Attachment): { rescan: () => void; detach: () => void } {
  let marks: FoundMark[] = []
  const rescan = (): void => {
    if (!at.stillThere()) return
    quietly(() => {
      marks = scanMarks(at.doc, at.documentId)
    })
    at.onMarks(marks)
    at.moved()
  }
  const find = (element: Element): FoundMark | null => {
    const known = marks.find((mark) => mark.element === element)
    if (known) return known
    rescan()
    return marks.find((mark) => mark.element === element) ?? null
  }
  rescan()
  const h = handlers(at, find)
  const view = readQuietly(() => at.doc.defaultView)
  const root = readQuietly(() => at.doc.documentElement)
  const removals = [
    watchChanges(at.doc, rescan),
    on(at.doc, 'mouseover', h.over),
    on(root, 'mouseleave', h.leave),
    on(at.doc, 'click', h.click, { capture: true }),
    on(at.doc, 'keydown', h.key),
    on(at.doc, 'scroll', at.moved, { capture: true, passive: true }),
    on(view, 'resize', at.moved),
    on(window, 'resize', at.moved),
  ]
  return {
    rescan,
    detach: () => {
      for (const remove of removals) remove()
    },
  }
}
