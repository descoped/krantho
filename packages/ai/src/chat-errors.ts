import type { ChatErrorCode, ChatErrorEvent } from './chat-types.js'

const TOOLS_UNSUPPORTED =
  /does(?: not|n't) support (?:tools|tool use|tool calling|function calling)|no endpoints found that support tool use|tools? (?:is|are) not supported|function calling is not (?:enabled|supported)|function tools\b[^.]*\bnot supported/i

/**
 * True when a provider's error message says the model cannot use tools
 * (Ollama: "… does not support tools"; OpenRouter: "No endpoints found that
 * support tool use"; OpenAI, on a model that takes function tools only through its
 * Responses API: "Function tools with reasoning_effort are not supported for … in
 * /v1/chat/completions").
 */
export function isToolsUnsupportedMessage(message: string): boolean {
  return TOOLS_UNSUPPORTED.test(message)
}

/** The error code for an HTTP status and the provider's message */
export function chatErrorCode(status: number, message: string): ChatErrorCode {
  if ((status === 400 || status === 404 || status === 422) && isToolsUnsupportedMessage(message)) {
    return 'tools_unsupported'
  }
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limited'
  if (status === 503 || status === 529) return 'overloaded'
  if (status >= 400 && status < 500) return 'bad_request'
  return 'provider'
}

/** Map a non-2xx provider response to one `error` event (both wire formats) */
export async function chatErrorFromResponse(res: Response): Promise<ChatErrorEvent> {
  const text = await res.text().catch(() => '')
  const message = errorMessage(text) ?? `LLM API error: ${String(res.status)}`
  return { type: 'error', code: chatErrorCode(res.status, message), message, status: res.status }
}

/** Map a rejected fetch or a failed body read to one `error` event */
export function chatErrorFromException(err: unknown): ChatErrorEvent {
  if (err instanceof Error && err.name === 'AbortError') return abortedError()
  const message = err instanceof Error ? err.message : String(err)
  return { type: 'error', code: 'network', message }
}

/** The `error` event for a request the caller aborted */
export function abortedError(): ChatErrorEvent {
  return { type: 'error', code: 'aborted', message: 'The request was aborted' }
}

/**
 * `error.message` from an error body: `{ error: { message } }`, `{ error: "…" }`, or the
 * same wrapped in an array, as Gemini's OpenAI-compatible endpoint sends it
 */
function errorMessage(text: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (Array.isArray(parsed)) parsed = parsed[0]
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined
  const error = parsed.error
  if (typeof error === 'string' && error !== '') return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return typeof error.message === 'string' && error.message !== '' ? error.message : undefined
  }
  return undefined
}
