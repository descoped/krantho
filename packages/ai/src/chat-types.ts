import type { Provider } from './types.js'

/** A tool the model may call; `inputSchema` is a JSON Schema object */
export interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** A complete tool call from the model */
export interface ToolCall {
  id: string
  name: string
  /** Parsed arguments; `{}` when `inputError` is set */
  input: Record<string, unknown>
  /** Set when the model's arguments were not a JSON object */
  inputError?: string | undefined
  /**
   * Provider fields that must travel back with this call unchanged (Gemini's
   * `extra_content` thought signature). Opaque to callers.
   */
  extra?: Record<string, unknown> | undefined
}

/**
 * Provider state attached to one model turn that must be sent back unchanged
 * with that turn (Anthropic thinking blocks, OpenRouter reasoning details).
 * Opaque to callers; an adapter replays only a value it produced itself.
 */
export interface ProviderReplay {
  provider: Provider
  data: unknown
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      content: string
      toolCalls?: readonly ToolCall[] | undefined
      replay?: ProviderReplay | undefined
    }
  | { role: 'tool'; toolCallId: string; content: string; isError?: boolean | undefined }

export interface ChatRequest {
  system?: string | undefined
  messages: readonly ChatMessage[]
  tools?: readonly ChatTool[] | undefined
  /** 'none' keeps the tool definitions but forbids calling them (the history may hold tool calls) */
  toolChoice?: 'auto' | 'none' | undefined
  maxTokens?: number | undefined
  signal?: AbortSignal | undefined
}

export type ChatStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export type ChatErrorCode =
  | 'tools_unsupported'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'bad_request'
  | 'network'
  | 'aborted'
  | 'provider'

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'stop'; reason: ChatStopReason; raw: string; replay?: ProviderReplay | undefined }
  | { type: 'error'; code: ChatErrorCode; message: string; status?: number | undefined }

/** The `error` member of `ChatEvent` */
export type ChatErrorEvent = Extract<ChatEvent, { type: 'error' }>

/** Streaming, tool-using chat over one provider and model */
export interface ChatAdapter {
  readonly provider: Provider
  readonly model: string
  /**
   * Stream one model turn. Never throws for provider, network or abort
   * failures — they arrive as one `error` event, after which the stream ends.
   * A successful turn ends with `usage` then `stop`.
   */
  stream(request: ChatRequest): AsyncIterable<ChatEvent>
}
