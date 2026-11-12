import { vi } from 'vitest'
import type { ChatEvent } from '../src/chat-types.js'

/** A chunk of a streamed body: a string (UTF-8 encoded) or raw bytes */
export type Chunk = string | Uint8Array

const encoder = new TextEncoder()

function toBytes(chunk: Chunk): Uint8Array {
  return typeof chunk === 'string' ? encoder.encode(chunk) : chunk
}

/**
 * A byte stream emitting the given chunks one per pull. With `hang`, the stream
 * never closes after the last chunk; `onCancel` records a cancellation.
 */
export function byteStream(
  chunks: Chunk[],
  options: { hang?: boolean; onCancel?: () => void } = {},
): ReadableStream<Uint8Array> {
  let next = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[next]
      next += 1
      if (chunk !== undefined) {
        controller.enqueue(toBytes(chunk))
        return undefined
      }
      if (options.hang === true) return new Promise<void>(() => undefined)
      controller.close()
      return undefined
    },
    cancel() {
      options.onCancel?.()
    },
  })
}

/** A `text/event-stream` response whose body emits the given chunks */
export function sseResponse(chunks: Chunk[], status = 200): Response {
  return new Response(byteStream(chunks), {
    status,
    headers: { 'content-type': 'text/event-stream' },
  })
}

/** A JSON response (provider error bodies) */
export function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** One Anthropic Messages stream event */
export function anthropicEvent(name: string, data: Record<string, unknown>): string {
  return `event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`
}

/** One OpenAI-compatible stream chunk, or the `[DONE]` sentinel */
export function openaiChunk(data: Record<string, unknown> | '[DONE]'): string {
  return `data: ${data === '[DONE]' ? data : JSON.stringify(data)}\n\n`
}

/** Collect every event of a chat stream */
export async function collect(events: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

/** Install a fetch stub; returns the mock so tests can script responses and read calls */
export function stubFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn()
  vi.stubGlobal('fetch', mock)
  return mock
}

/** The URL and parsed JSON body of the fetch call at `index` */
export function sentRequest(
  mock: ReturnType<typeof vi.fn>,
  index = 0,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const [url, init] = mock.mock.calls[index] as [string, RequestInit]
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }
}
