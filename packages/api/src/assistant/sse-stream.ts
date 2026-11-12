import type { AssistantEvent } from './protocol.js'

/** Sends one event to the client */
export type Emit = (event: AssistantEvent) => void

/** A comment line this often keeps proxies from closing an idle stream */
const PING_INTERVAL_MS = 15_000

/** Response headers of an event stream: never cached, never buffered by a proxy */
export const EVENT_STREAM_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
}

/** `event: <type>` and the event as JSON data, ending with the blank line that dispatches it */
export function encodeEvent(event: AssistantEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * A byte stream of SSE events produced by `run`. Cancelling the stream (the
 * client went away) or aborting `upstream` aborts `run`'s signal. An exception
 * escaping `run` becomes an `internal` error and `done error`; the stream
 * closes when `run` settles.
 */
export function createEventStream(
  run: (emit: Emit, signal: AbortSignal) => Promise<void>,
  upstream: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const abort = new AbortController()
  const encoder = new TextEncoder()
  const onUpstreamAbort = (): void => abort.abort()
  let closed = false
  let ping: ReturnType<typeof setInterval> | undefined

  const finish = (): void => {
    closed = true
    clearInterval(ping)
    upstream?.removeEventListener('abort', onUpstreamAbort)
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string): void => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      const emit: Emit = (event) => send(encodeEvent(event))

      if (upstream?.aborted) abort.abort()
      else upstream?.addEventListener('abort', onUpstreamAbort, { once: true })
      ping = setInterval(() => send(': ping\n\n'), PING_INTERVAL_MS)

      run(emit, abort.signal)
        .catch((err: unknown) => {
          console.error('[krantho] assistant request failed:', err)
          emit({ type: 'error', code: 'internal', message: 'The assistant failed unexpectedly.' })
          emit({ type: 'done', reason: 'error' })
        })
        .finally(() => {
          if (closed) return
          finish()
          controller.close()
        })
    },
    cancel() {
      finish()
      abort.abort()
    },
  })
}
