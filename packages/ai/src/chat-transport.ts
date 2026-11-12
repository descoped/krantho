import { abortedError, chatErrorFromException, chatErrorFromResponse } from './chat-errors.js'
import type { ChatErrorEvent, ChatEvent } from './chat-types.js'
import { parseServerSentEvents, type ServerSentEvent } from './sse.js'

/** Turns one wire format's server-sent events into chat events, for a single model turn */
export interface TurnDecoder {
  /** Decode one event. Once `done` is true the turn is complete and the stream is dropped. */
  accept(event: ServerSentEvent): ChatEvent[]
  /** The events that close a stream which ended before the decoder was done */
  end(): ChatEvent[]
  readonly done: boolean
}

export interface ChatPost {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  signal?: AbortSignal | undefined
}

/**
 * POST a streaming chat request and decode its event stream. Never throws:
 * network, HTTP and abort failures arrive as one `error` event.
 */
export async function* streamChatTurn(
  post: ChatPost,
  decoder: TurnDecoder,
): AsyncGenerator<ChatEvent> {
  const { signal } = post
  if (signal?.aborted === true) {
    yield abortedError()
    return
  }
  let res: Response
  try {
    res = await fetch(post.url, {
      method: 'POST',
      headers: post.headers,
      body: JSON.stringify(post.body),
      ...(signal !== undefined ? { signal } : {}),
    })
  } catch (err) {
    yield failure(err, signal)
    return
  }
  if (!res.ok) {
    yield await chatErrorFromResponse(res)
    return
  }
  if (res.body === null) {
    yield { type: 'error', code: 'provider', message: 'The provider sent no response body' }
    return
  }
  yield* decodeBody(res.body, decoder, signal)
}

async function* decodeBody(
  body: ReadableStream<Uint8Array>,
  decoder: TurnDecoder,
  signal: AbortSignal | undefined,
): AsyncGenerator<ChatEvent> {
  try {
    for await (const event of parseServerSentEvents(body, signal)) {
      yield* decoder.accept(event)
      if (decoder.done) return
    }
  } catch (err) {
    yield failure(err, signal)
    return
  }
  if (signal?.aborted === true) {
    yield abortedError()
    return
  }
  yield* decoder.end()
}

function failure(err: unknown, signal: AbortSignal | undefined): ChatErrorEvent {
  return signal?.aborted === true ? abortedError() : chatErrorFromException(err)
}

/** The `data` of an event parsed as a JSON object, or undefined when it is not one */
export function parseEventData(data: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(data)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** The `error` event for stream data that is not a JSON object */
export function malformedEventError(): ChatErrorEvent {
  return { type: 'error', code: 'provider', message: 'The provider sent an event that is not JSON' }
}

/** The `error` event for a stream that closed before the turn was complete */
export function earlyEndError(): ChatErrorEvent {
  return { type: 'error', code: 'provider', message: 'The provider ended the stream early' }
}

/**
 * Parse streamed tool-call arguments. An empty buffer is `{}`; anything that
 * is not a JSON object yields `{}` and the reason in `inputError`.
 */
export function parseToolInput(buffer: string): {
  input: Record<string, unknown>
  inputError?: string
} {
  if (buffer.trim() === '') return { input: {} }
  try {
    const parsed: unknown = JSON.parse(buffer)
    if (isRecord(parsed)) return { input: parsed }
    return { input: {}, inputError: 'The tool arguments were not a JSON object' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { input: {}, inputError: `The tool arguments were not valid JSON: ${reason}` }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The object at `key`, or an empty object */
export function recordAt(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return isRecord(value) ? value : {}
}

/** The number at `key`, or 0 */
export function numberAt(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  return typeof value === 'number' ? value : 0
}

/** The string at `key`, or '' */
export function stringAt(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}
