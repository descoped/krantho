/** One dispatched server-sent event */
export interface ServerSentEvent {
  event: string
  data: string
  id?: string | undefined
}

/** Fields of the event being assembled from lines */
interface PendingEvent {
  event: string
  data: string[]
  id?: string | undefined
}

function emptyEvent(): PendingEvent {
  return { event: '', data: [] }
}

/**
 * Parse a `text/event-stream` body into events (WHATWG rules).
 *
 * Decodes UTF-8 across chunk boundaries, accepts `\r\n`, `\n` and `\r` line
 * endings, skips comment lines, joins multi-line data with `\n`, and dispatches
 * a final event that is not followed by a blank line. The reader is cancelled
 * when the consumer stops early or `signal` aborts, and released in every case.
 * Browser-safe: no Node imports.
 */
export async function* parseServerSentEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal | undefined,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const onAbort = (): void => {
    reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  let finished = false
  let buffer = ''
  let pending = emptyEvent()
  try {
    for (;;) {
      if (isAborted(signal)) return
      const { value, done } = await reader.read()
      if (isAborted(signal)) return
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      for (let line = takeLine(buffer, done); line !== null; line = takeLine(buffer, done)) {
        buffer = line.rest
        const dispatched = applyLine(pending, line.text)
        if (dispatched === undefined) continue
        pending = emptyEvent()
        if (dispatched !== null) yield dispatched
      }
      if (done) break
    }
    finished = true
    // The stream ended without a blank line: the partial last line still counts
    if (buffer !== '') applyLine(pending, buffer)
    const final = toEvent(pending)
    if (final !== null) yield final
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!finished) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** A function, not an inline check: the signal can abort while a read is pending */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/**
 * The next complete line in `buffer`, or null when none is complete yet. A `\r`
 * at the end of the buffer may be the first half of `\r\n`, so it waits for the
 * next chunk unless the stream has ended.
 */
function takeLine(buffer: string, streamEnded: boolean): { text: string; rest: string } | null {
  const end = buffer.search(/[\r\n]/)
  if (end === -1) return null
  if (buffer[end] === '\n') return { text: buffer.slice(0, end), rest: buffer.slice(end + 1) }
  if (end === buffer.length - 1 && !streamEnded) return null
  const width = buffer[end + 1] === '\n' ? 2 : 1
  return { text: buffer.slice(0, end), rest: buffer.slice(end + width) }
}

/**
 * Apply one line to the pending event. Returns `undefined` when the line only
 * updated the event, or — on a blank line — the event to dispatch (null when it
 * has no data and is dropped).
 */
function applyLine(pending: PendingEvent, line: string): ServerSentEvent | null | undefined {
  if (line === '') return toEvent(pending)
  if (line.startsWith(':')) return undefined
  const colon = line.indexOf(':')
  const field = colon === -1 ? line : line.slice(0, colon)
  const raw = colon === -1 ? '' : line.slice(colon + 1)
  const value = raw.startsWith(' ') ? raw.slice(1) : raw
  if (field === 'event') pending.event = value
  else if (field === 'data') pending.data.push(value)
  else if (field === 'id') pending.id = value
  return undefined
}

function toEvent(pending: PendingEvent): ServerSentEvent | null {
  const data = pending.data.join('\n')
  if (data === '') return null
  const event: ServerSentEvent = { event: pending.event === '' ? 'message' : pending.event, data }
  if (pending.id !== undefined) event.id = pending.id
  return event
}
