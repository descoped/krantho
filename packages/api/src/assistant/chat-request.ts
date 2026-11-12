import type { ApiContext, ApiResponse } from '../types.js'
import type { AssistantChatRequest } from './protocol.js'

type ChatMessageInput = AssistantChatRequest['messages'][number]

/** A slug or locale as Studio's routes carry them */
const ROUTE_TOKEN = /^[A-Za-z0-9._-]{1,200}$/

function badRequest(error: string): { ok: false; response: ApiResponse } {
  return { ok: false, response: { status: 400, body: { error } } }
}

function isMessage(value: unknown): value is ChatMessageInput {
  if (!value || typeof value !== 'object') return false
  const { role, content } = value as Record<string, unknown>
  return (role === 'user' || role === 'assistant') && typeof content === 'string' && content !== ''
}

/** The screen context, kept only when it names a collection that exists */
function parseContext(value: unknown, ctx: ApiContext): AssistantChatRequest['context'] {
  if (!value || typeof value !== 'object') return undefined
  const { collection, slug, locale } = value as Record<string, unknown>
  if (typeof collection !== 'string' || !ctx.contentConfig.collections.has(collection)) {
    return undefined
  }
  const token = (v: unknown): string | undefined =>
    typeof v === 'string' && ROUTE_TOKEN.test(v) ? v : undefined
  return { collection, slug: token(slug), locale: token(locale) }
}

/**
 * Validate a chat request: a non-empty conversation of user and assistant text
 * turns that starts and ends with the user (400), within the history and
 * character limits (413). Only `messages`, `provider` and `context` are read — tool calls
 * and tool results are never accepted from the client.
 */
export function parseChatRequest(
  body: unknown,
  ctx: ApiContext,
): { ok: true; value: AssistantChatRequest } | { ok: false; response: ApiResponse } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Request body must be a JSON object')
  }
  const { messages, context, provider } = body as Record<string, unknown>
  if (!Array.isArray(messages) || messages.length === 0) {
    return badRequest('messages must be a non-empty array')
  }
  if (!messages.every(isMessage)) {
    return badRequest('Each message needs role "user" or "assistant" and non-empty text content')
  }
  if (messages[0]?.role !== 'user' || messages[messages.length - 1]?.role !== 'user') {
    return badRequest('The conversation must start and end with a user message')
  }

  const limits = ctx.config.assistant.limits
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0)
  if (messages.length > limits.maxHistoryMessages || chars > limits.maxInputChars) {
    const error = `The conversation is too long (at most ${limits.maxHistoryMessages} messages and ${limits.maxInputChars} characters)`
    return { ok: false, response: { status: 413, body: { error } } }
  }

  if (provider !== undefined && typeof provider !== 'string') {
    return badRequest('provider must be a string')
  }
  const value: AssistantChatRequest = {
    messages: messages.map(({ role, content }) => ({ role, content })),
    provider,
    context: parseContext(context, ctx),
  }
  return { ok: true, value }
}
