import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Attachment, attach, type FrameEvents, on } from './live-attach.js'
import {
  type FrameSeen,
  type FrameState,
  inspectFrame,
  nextFrameState,
  readQuietly,
} from './live-frame-state.js'
import type { FoundMark } from './live-marks.js'
import { numberBodySections } from './live-sections.js'

/** How long the preview may take to load before Live mode gives up on it */
export const LOAD_TIMEOUT_MS = 20_000
/** How often the page's address is checked: a client-side navigation fires no load */
const LOCATION_CHECK_MS = 500

/** What the frame loads and reads */
export interface FrameSource {
  /** The preview entry the frame loads */
  src: string
  /** The document's page path: the frame shows the page only there */
  path: string
  /** The edited document's `<collection>/<slug>` mark */
  documentId: string
  /** The draft's body, which tells the body's own render apart (`numberBodySections`) */
  body: string
  /** A new value starts the frame again from the preview entry: Save, Reload the preview, Back to the page */
  reload: number
}

export interface LiveFrame {
  /** The preview entry the frame loads */
  src: string
  /** The frame's key: a new one loads the preview entry again */
  reload: number
  frameRef: RefObject<HTMLIFrameElement | null>
  state: FrameState
  /** The document's marks on the page; none unless the frame shows the page */
  marks: readonly FoundMark[]
  onLoad: () => void
  /** Read the page's marks again: after a patch replaced some of its elements */
  rescan: () => void
}

/** A notifier that runs at most once per frame */
function perFrame(run: () => void): { notify: () => void; cancel: () => void } {
  let frame: number | null = null
  return {
    notify: () => {
      frame ??= requestAnimationFrame(() => {
        frame = null
        run()
      })
    },
    cancel: () => {
      if (frame !== null) cancelAnimationFrame(frame)
    },
  }
}

/** Fail the preview when the load in progress — the reload it is for, or null — does not finish in time */
function useLoadTimeout(loading: number | null, fail: () => void): void {
  useEffect(() => {
    if (loading === null) return
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [loading, fail])
}

const LOADING: FrameState = { kind: 'loading' }

/**
 * The frame's state, moved on by each load and by a check that the page is
 * still shown; a reload starts it again from loading, in the same render
 */
function useFrameState(
  source: FrameSource,
  frameRef: RefObject<HTMLIFrameElement | null>,
): [FrameState, (seen: FrameSeen) => void, () => void] {
  const { src, path, reload } = source
  const [held, setHeld] = useState({ reload, state: LOADING })
  const current = useRef(reload)
  current.current = reload
  const state = held.reload === reload ? held.state : LOADING
  const see = useCallback((seen: FrameSeen) => {
    setHeld((now) => {
      const from = now.reload === current.current ? now.state : LOADING
      return { reload: current.current, state: nextFrameState(from, seen) }
    })
  }, [])
  const fail = useCallback(() => see({ kind: 'timeout' }), [see])
  useLoadTimeout(state.kind === 'loading' ? reload : null, fail)
  const onLoad = useCallback(
    () => see(inspectFrame(frameRef.current, src, path)),
    [see, frameRef, src, path],
  )
  return [state, see, onLoad]
}

/**
 * Live mode's hold on the preview frame: on each load it reads the frame's
 * document from the parent — no script in the page — and counts it as the
 * page only when it is the document's page path as HTML. It scans it for the
 * document's marks, rescans on changes for a short while, reports hover,
 * clicks and Esc, and notices when the frame leaves the page — another path,
 * another origin — even without a load. Everything is let go on unmount and
 * on the next load.
 */
export function useLiveFrame(source: FrameSource, events: FrameEvents): LiveFrame {
  const { src, path, documentId, body, reload } = source
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [state, see, onLoad] = useFrameState(source, frameRef)
  const look = useCallback(() => inspectFrame(frameRef.current, src, path), [src, path])
  const raw = useRef<readonly FoundMark[]>([])
  const bodyNow = useRef(body)
  bodyNow.current = body
  const latest = useRef(events)
  latest.current = numbered(events, () => numberBodySections(raw.current, bodyNow.current))
  const attached = useAttached({ state, documentId, events: latest, look, see, raw })
  useWatchWhileMoved(state, frameRef, look, see)
  const marks = useMemo(() => numberBodySections(attached.marks, body), [attached.marks, body])
  return { src, reload, frameRef, state, onLoad, rescan: attached.rescan, marks }
}

/** The page's events with each mark as the body numbers it: the page itself reports them unnumbered */
function numbered(events: FrameEvents, marks: () => readonly FoundMark[]): FrameEvents {
  const same = (mark: FoundMark): FoundMark =>
    marks().find((found) => found.element === mark.element) ?? mark
  return {
    onHover: (mark) => events.onHover(mark && same(mark)),
    onPick: (mark, point) => events.onPick(same(mark), point),
    onEscape: events.onEscape,
    onOutsideClick: events.onOutsideClick,
  }
}

/**
 * While the frame shows another page of the site, keep looking — on a poll
 * and on the frame's popstate — so a client-side return to the page, which
 * fires no load, shows it again
 */
function useWatchWhileMoved(
  state: FrameState,
  frameRef: RefObject<HTMLIFrameElement | null>,
  look: () => FrameSeen,
  see: (seen: FrameSeen) => void,
): void {
  const moved = state.kind === 'moved'
  useEffect(() => {
    if (!moved) return
    const check = (): void => see(look())
    const timer = setInterval(check, LOCATION_CHECK_MS)
    const removePop = on(
      readQuietly(() => frameRef.current?.contentWindow),
      'popstate',
      check,
    )
    return () => {
      clearInterval(timer)
      removePop()
    }
  }, [moved, frameRef, look, see])
}

/** A check that the frame still shows this page; when it does not, what it shows moves the state on */
function stillShowing(
  doc: Document,
  look: () => FrameSeen,
  see: (seen: FrameSeen) => void,
): () => boolean {
  return () => {
    const seen = look()
    if (seen.kind === 'page' && seen.doc === doc) return true
    see(seen)
    return false
  }
}

/**
 * The attachment while the frame shows the page: its marks, a rescan, and a
 * tick that re-renders whenever the page scrolls, resizes or changes, so boxes
 * are read again. A look that finds the frame elsewhere moves the state on,
 * which lets the page go; marks are none while it is not shown.
 */
interface AttachedInput {
  state: FrameState
  documentId: string
  events: RefObject<FrameEvents>
  look: () => FrameSeen
  see: (seen: FrameSeen) => void
  /** The marks as last read, for the page's events between renders */
  raw: { current: readonly FoundMark[] }
}

function useAttached(input: AttachedInput): Pick<LiveFrame, 'marks' | 'rescan'> {
  const { state, documentId, events, look, see, raw } = input
  const [marks, setMarks] = useState<readonly FoundMark[]>([])
  // The tick's value is never read: setting it re-renders, and the boxes are read again
  const [, setLayout] = useState(0)
  const rescanRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (state.kind !== 'ready') {
      raw.current = []
      setMarks([])
      return
    }
    const moved = perFrame(() => setLayout((n) => n + 1))
    const stillThere = stillShowing(state.doc, look, see)
    const onMarks = (found: FoundMark[]): void => {
      raw.current = found
      setMarks(found)
    }
    const at: Attachment = {
      doc: state.doc,
      documentId,
      events,
      onMarks,
      moved: moved.notify,
      stillThere,
    }
    const attached = attach(at)
    rescanRef.current = attached.rescan
    const check = setInterval(stillThere, LOCATION_CHECK_MS)
    return () => {
      clearInterval(check)
      rescanRef.current = () => undefined
      attached.detach()
      moved.cancel()
    }
  }, [state, documentId, events, look, see, raw])
  const rescan = useCallback(() => rescanRef.current(), [])
  return { marks, rescan }
}
