/**
 * What the preview frame shows, and how Live mode's view of it moves on. Only
 * the document's own page — its page path, as HTML, answered without an error
 * status — counts as the page. Pure, apart from reading the frame.
 */

/** What one look at the frame found */
export type FrameSeen =
  /** The frame's empty document before it navigates: not the page yet */
  | { readonly kind: 'blank' }
  | { readonly kind: 'page'; readonly doc: Document }
  /** A page of this origin at another path */
  | { readonly kind: 'other'; readonly path: string }
  /** An answer that is not the page: an error status, JSON or text; `status` is 0 where the browser does not report it */
  | { readonly kind: 'error'; readonly path: string; readonly status: number }
  /** Another origin, a refused frame, or the browser's own error page */
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'timeout' }

/** Live mode's view of the frame */
export type FrameState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly doc: Document }
  /** The page was shown and the frame has gone to another page of the site */
  | { readonly kind: 'moved'; readonly path: string }
  | { readonly kind: 'failed'; readonly why: 'unreadable' | 'timeout' | 'left' }
  /** An answer that is not the page, at `path`, with `status` — 0 where the browser does not report it */
  | {
      readonly kind: 'failed'
      readonly why: 'error'
      readonly path: string
      readonly status: number
    }

/** Run something against the frame's page, which may have gone to another origin: a refusal changes nothing */
export function quietly(run: () => void): void {
  try {
    run()
  } catch {
    // The page is another origin's now, or gone: there is nothing left to read or undo
  }
}

/** Read something of the frame's page, which may have gone to another origin: null when refused */
export function readQuietly<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

/** A path compared as the site serves it: decoded, without a trailing slash */
function normalPath(path: string): string {
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Keep the path as written when it does not decode
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded
}

/** Whether two paths are the same page */
export function samePath(a: string, b: string): boolean {
  return normalPath(a) === normalPath(b)
}

/** The HTTP status the frame's document was answered with, where the browser reports it */
function answeredStatus(doc: Document): number {
  const timing = doc.defaultView?.performance?.getEntriesByType?.('navigation')[0] as
    | { responseStatus?: number | undefined }
    | undefined
  return timing?.responseStatus ?? 0
}

/** Look at the frame: is it the document's page (`path`) on this origin? */
export function inspectFrame(
  frame: HTMLIFrameElement | null,
  src: string,
  path: string,
): FrameSeen {
  try {
    const doc = frame?.contentDocument ?? null
    if (!doc) return { kind: 'unreadable' }
    if (doc.URL === 'about:blank' && src !== 'about:blank') return { kind: 'blank' }
    const at = new URL(doc.URL).pathname
    const status = answeredStatus(doc)
    if (doc.contentType !== 'text/html' || status >= 400) return { kind: 'error', path: at, status }
    return samePath(at, path) ? { kind: 'page', doc } : { kind: 'other', path: at }
  } catch {
    return { kind: 'unreadable' }
  }
}

/**
 * The view after a look. Before the page was ever shown, anything but the
 * page is a failure; once it was shown, another page of the site is a move
 * and an unreadable frame means it has left.
 */
export function nextFrameState(now: FrameState, seen: FrameSeen): FrameState {
  const shown = now.kind === 'ready' || now.kind === 'moved'
  switch (seen.kind) {
    case 'blank':
      return now
    case 'page':
      return now.kind === 'ready' && now.doc === seen.doc ? now : { kind: 'ready', doc: seen.doc }
    case 'timeout':
      return now.kind === 'loading' ? { kind: 'failed', why: 'timeout' } : now
    case 'unreadable':
      return { kind: 'failed', why: shown ? 'left' : 'unreadable' }
    default:
      if (!shown) {
        const status = seen.kind === 'error' ? seen.status : 0
        return { kind: 'failed', why: 'error', path: seen.path, status }
      }
      return now.kind === 'moved' && now.path === seen.path
        ? now
        : { kind: 'moved', path: seen.path }
  }
}
