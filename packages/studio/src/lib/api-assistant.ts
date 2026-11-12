import type { ChatErrorCode } from '@krantho/ai'
import { parseServerSentEvents } from '@krantho/ai'
import { ApiError, BASE } from './api-client.js'
import { authFetch } from './auth.js'

// --- Protocol types (mirror the `@krantho/api` assistant protocol) ---

/** POST /api/assistant/chat body */
export interface AssistantChatRequest {
  /** The conversation so far, oldest first, ending with the user's new message */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** The Studio screen the user is on */
  context?:
    | { collection: string; slug?: string | undefined; locale?: string | undefined }
    | undefined
  /** The AI the user picked in the dialog; absent runs the site's own */
  provider?: string | undefined
}

export type AssistantErrorCode = ChatErrorCode | 'limit' | 'internal'

export type AssistantDoneReason =
  | 'end_turn'
  | 'max_tokens'
  | 'refusal'
  | 'limit'
  | 'aborted'
  | 'error'

/** One document, addressed exactly */
export interface DocumentRef {
  collection: string
  slug: string
  locale: string
  version?: number | undefined
}

/** One field's value before and after a change */
export interface FieldChange {
  name: string
  before: unknown
  after: unknown
}

/** What a change does to one document */
export interface DocumentChange {
  ref: DocumentRef
  /** The version the change was computed against; 0 for a new document */
  baseVersion: number
  fields: FieldChange[]
  body?: { before: string; after: string } | undefined
  status?: { before: string; after: string } | undefined
}

/** One result of an SEO check */
export interface SeoFinding {
  severity: 'error' | 'warning' | 'info'
  /** `title`, `meta-description`, or `structured-data` */
  check: string
  message: string
  /** For a structured-data finding: `schema.org` for the vocabulary, or the reader whose rule raised it */
  reader?: string | undefined
  /** For a structured-data finding: what it is about (`unresolved-reference`, `profile-required` …) */
  code?: string | undefined
  type?: string | undefined
  property?: string | undefined
  /** The documentation the rule comes from */
  source?: string | undefined
}

export type PendingActionKind =
  | 'save_documents'
  | 'publish'
  | 'delete'
  | 'save_seo_properties'
  | 'save_llms_txt'

/** A proposal the user confirms in the chat */
export interface PendingActionView {
  token: string
  kind: PendingActionKind
  /** One line: what confirming does */
  title: string
  confirmLabel: string
  destructive: boolean
  expiresAt: string
}

/** What one tool call did */
export interface AssistantActivity {
  /** The tool call id */
  id: string
  tool: string
  status: 'done' | 'failed' | 'pending' | 'proposed'
  summary: string
  documents: DocumentRef[]
  changes?: DocumentChange[] | undefined
  pending?: PendingActionView | undefined
  proposal?: { title: string; items: Array<{ label: string; text: string }> } | undefined
  findings?: SeoFinding[] | undefined
}

/** One server-sent event of a chat response */
export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; tool: string; label: string }
  | { type: 'activity'; activity: AssistantActivity }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; code: AssistantErrorCode; message: string }
  | { type: 'done'; reason: AssistantDoneReason }

/** The request bounds the server enforces; Studio trims history to them */
export interface AssistantLimits {
  maxTurns: number
  maxToolCalls: number
  maxTokens: number
  maxRequestTokens: number
  maxHistoryMessages: number
  maxInputChars: number
  toolResultChars: number
}

/** GET /api/assistant */
export type AssistantStatus =
  | {
      configured: true
      provider: string
      model: string
      credential: 'oauth' | 'api-key' | 'none'
      /** The AIs that are on, by the name a person knows them by */
      providers: Array<{ provider: string; label: string }>
      tools: Array<{ name: string; label: string }>
      limits: AssistantLimits
      confirmTtlSec: number
    }
  | { configured: false; error: string }

/** The outcome of one step of a confirmed action */
export interface AssistantActionResult {
  collection?: string | undefined
  slug?: string | undefined
  status: 'done' | 'failed'
  message: string
  version?: number | undefined
}

/** POST /api/assistant/confirm */
export interface AssistantConfirmResult {
  ok: boolean
  results: AssistantActionResult[]
}

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'tool',
  'activity',
  'usage',
  'error',
  'done',
])

// --- Client ---

/** An `ApiError` from a non-2xx answer, with the server's `error` message when it sent JSON */
async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    // Not JSON (a proxy's error page) — keep the status only
  }
  const message = typeof body.error === 'string' ? body.error : `Request failed: ${res.status}`
  return new ApiError(message, res.status, body)
}

function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return authFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

/** The provider, model, tools and limits — or why the assistant cannot run */
export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  const res = await authFetch(`${BASE}/assistant`)
  if (!res.ok) throw await errorFromResponse(res)
  return (await res.json()) as AssistantStatus
}

/** POST the chat and call onEvent for each SSE event; resolves when the stream ends */
export async function streamAssistantChat(
  body: AssistantChatRequest,
  onEvent: (event: AssistantEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await postJson('/assistant/chat', body, signal)
  if (!res.ok) throw await errorFromResponse(res)
  if (!res.body) throw new ApiError('The assistant sent no response', res.status, {})
  for await (const message of parseServerSentEvents(res.body, signal)) {
    if (!EVENT_TYPES.has(message.event)) continue
    const data = JSON.parse(message.data) as Record<string, unknown>
    onEvent({ ...data, type: message.event } as AssistantEvent)
  }
}

/** Execute a proposal the user confirmed; refreshes an expired session once */
export async function confirmAssistantAction(token: string): Promise<AssistantConfirmResult> {
  const res = await postJson('/assistant/confirm', { token })
  if (!res.ok) throw await errorFromResponse(res)
  return (await res.json()) as AssistantConfirmResult
}
