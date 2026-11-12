import type { ChatErrorCode } from '@krantho/ai'

/** POST /api/assistant/chat body */
export interface AssistantChatRequest {
  /** The conversation so far, oldest first, ending with the user's new message */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** The provider the user picked in the dialog; unset uses the one in use */
  provider?: string | undefined
  /** The Studio screen the user is on */
  context?:
    | { collection: string; slug?: string | undefined; locale?: string | undefined }
    | undefined
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

/** What a pending action does when confirmed */
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

/** What one tool call did, as Studio shows it */
export interface AssistantActivity {
  /** The tool call id */
  id: string
  tool: string
  status: 'done' | 'failed' | 'pending' | 'proposed'
  /** One server-written line, e.g. "Created draft pages/pricing (v1)" */
  summary: string
  documents: DocumentRef[]
  changes?: DocumentChange[] | undefined
  pending?: PendingActionView | undefined
  /** Output shown for the user to use by hand (FAQ entries, a summary) when nothing can be written */
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
