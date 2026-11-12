import { anthropicHeaders } from './anthropic-headers.js'
import {
  earlyEndError,
  malformedEventError,
  numberAt,
  parseEventData,
  parseToolInput,
  recordAt,
  streamChatTurn,
  stringAt,
  type TurnDecoder,
} from './chat-transport.js'
import type {
  ChatAdapter,
  ChatErrorCode,
  ChatErrorEvent,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ChatStopReason,
} from './chat-types.js'
import type { ServerSentEvent } from './sse.js'
import type { Provider } from './types.js'

const DEFAULT_MAX_TOKENS = 16000

type WireBlock = Record<string, unknown>

/** A content block as it is being assembled; `json` buffers a tool call's arguments */
interface BlockSlot {
  block: WireBlock
  json?: string
}

/**
 * Streaming, tool-using chat over the Anthropic Messages API.
 *
 * Sends no `thinking` field (the model's default applies) and only `auto` or
 * `none` tool choice. Thinking and redacted-thinking blocks are assembled from
 * the stream and replayed verbatim with the turn that produced them.
 */
export class AnthropicChatAdapter implements ChatAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly authToken?: string | undefined,
    readonly provider: Provider = 'anthropic',
  ) {}

  stream(request: ChatRequest): AsyncIterable<ChatEvent> {
    return streamChatTurn(
      {
        url: `${this.baseUrl}/v1/messages`,
        headers: anthropicHeaders(this.apiKey, this.authToken),
        body: this.requestBody(request),
        signal: request.signal,
      },
      new AnthropicTurnDecoder(),
    )
  }

  private requestBody(request: ChatRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
    }
    if (request.system !== undefined) body.system = request.system
    body.messages = toAnthropicMessages(request.messages)
    if (request.tools !== undefined && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }))
      body.tool_choice = { type: request.toolChoice ?? 'auto' }
    }
    return body
  }
}

/** Chat messages as Messages API turns; consecutive tool results share one user turn */
function toAnthropicMessages(messages: readonly ChatMessage[]): WireBlock[] {
  const out: WireBlock[] = []
  let results: WireBlock[] | undefined
  for (const message of messages) {
    if (message.role === 'tool') {
      const result: WireBlock = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
      }
      if (message.isError === true) result.is_error = true
      if (results === undefined) {
        results = [result]
        out.push({ role: 'user', content: results })
      } else {
        results.push(result)
      }
      continue
    }
    results = undefined
    out.push(
      message.role === 'user' ? { role: 'user', content: message.content } : assistantTurn(message),
    )
  }
  return out
}

function assistantTurn(message: Extract<ChatMessage, { role: 'assistant' }>): WireBlock {
  if (message.replay?.provider === 'anthropic') {
    return { role: 'assistant', content: message.replay.data }
  }
  const content: WireBlock[] = []
  if (message.content !== '') content.push({ type: 'text', text: message.content })
  for (const call of message.toolCalls ?? []) {
    content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
  }
  return { role: 'assistant', content }
}

const STOP_REASONS = new Map<string, ChatStopReason>([
  ['end_turn', 'end_turn'],
  ['stop_sequence', 'end_turn'],
  ['tool_use', 'tool_use'],
  ['max_tokens', 'max_tokens'],
  ['model_context_window_exceeded', 'max_tokens'],
  ['refusal', 'refusal'],
])

const STREAM_ERROR_CODES = new Map<string, ChatErrorCode>([
  ['overloaded_error', 'overloaded'],
  ['rate_limit_error', 'rate_limited'],
  ['authentication_error', 'auth'],
  ['permission_error', 'auth'],
  ['invalid_request_error', 'bad_request'],
])

/** The Messages API stream state machine for one turn */
class AnthropicTurnDecoder implements TurnDecoder {
  done = false
  private readonly blocks = new Map<number, BlockSlot>()
  private inputTokens = 0
  private outputTokens = 0
  private stopReason = ''
  private sawToolCall = false

  accept(event: ServerSentEvent): ChatEvent[] {
    if (event.event === 'ping') return []
    const data = parseEventData(event.data)
    if (data === undefined) return this.fail(malformedEventError())
    switch (event.event) {
      case 'message_start':
        this.inputTokens = numberAt(recordAt(recordAt(data, 'message'), 'usage'), 'input_tokens')
        return []
      case 'content_block_start':
        this.startBlock(data)
        return []
      case 'content_block_delta':
        return this.applyDelta(data)
      case 'content_block_stop':
        return this.stopBlock(data)
      case 'message_delta':
        this.applyMessageDelta(data)
        return []
      case 'message_stop':
        return this.finish()
      case 'error':
        return this.fail(streamError(data))
      default:
        return []
    }
  }

  end(): ChatEvent[] {
    return [earlyEndError()]
  }

  private fail(error: ChatErrorEvent): ChatEvent[] {
    this.done = true
    return [error]
  }

  private startBlock(data: Record<string, unknown>): void {
    const block = { ...recordAt(data, 'content_block') }
    const slot: BlockSlot = { block }
    if (block.type === 'tool_use') slot.json = ''
    this.blocks.set(numberAt(data, 'index'), slot)
  }

  private applyDelta(data: Record<string, unknown>): ChatEvent[] {
    const slot = this.blocks.get(numberAt(data, 'index'))
    const delta = recordAt(data, 'delta')
    if (slot === undefined) return []
    switch (delta.type) {
      case 'text_delta': {
        const text = stringAt(delta, 'text')
        append(slot.block, 'text', text)
        return text === '' ? [] : [{ type: 'text', text }]
      }
      case 'input_json_delta':
        slot.json = (slot.json ?? '') + stringAt(delta, 'partial_json')
        return []
      case 'thinking_delta':
        append(slot.block, 'thinking', stringAt(delta, 'thinking'))
        return []
      case 'signature_delta':
        append(slot.block, 'signature', stringAt(delta, 'signature'))
        return []
      default:
        return []
    }
  }

  private stopBlock(data: Record<string, unknown>): ChatEvent[] {
    const slot = this.blocks.get(numberAt(data, 'index'))
    if (slot === undefined || slot.block.type !== 'tool_use') return []
    const { input, inputError } = parseToolInput(slot.json ?? '')
    slot.block.input = input
    this.sawToolCall = true
    const id = stringAt(slot.block, 'id')
    const name = stringAt(slot.block, 'name')
    return [
      {
        type: 'tool_call',
        call: inputError === undefined ? { id, name, input } : { id, name, input, inputError },
      },
    ]
  }

  private applyMessageDelta(data: Record<string, unknown>): void {
    const reason = recordAt(data, 'delta').stop_reason
    if (typeof reason === 'string') this.stopReason = reason
    const usage = recordAt(data, 'usage')
    if (typeof usage.output_tokens === 'number') this.outputTokens = usage.output_tokens
  }

  private finish(): ChatEvent[] {
    this.done = true
    const reason = this.sawToolCall ? 'tool_use' : (STOP_REASONS.get(this.stopReason) ?? 'other')
    const stop: Extract<ChatEvent, { type: 'stop' }> = {
      type: 'stop',
      reason,
      raw: this.stopReason,
    }
    if (this.sawToolCall) {
      const ordered = [...this.blocks.entries()].sort(([a], [b]) => a - b)
      stop.replay = { provider: 'anthropic', data: ordered.map(([, slot]) => slot.block) }
    }
    return [{ type: 'usage', inputTokens: this.inputTokens, outputTokens: this.outputTokens }, stop]
  }
}

function streamError(data: Record<string, unknown>): ChatErrorEvent {
  const error = recordAt(data, 'error')
  const type = stringAt(error, 'type')
  const message = stringAt(error, 'message')
  return {
    type: 'error',
    code: STREAM_ERROR_CODES.get(type) ?? 'provider',
    message: message === '' ? `Anthropic stream error: ${type || 'unknown'}` : message,
  }
}

function append(block: WireBlock, key: string, text: string): void {
  const current = block[key]
  block[key] = (typeof current === 'string' ? current : '') + text
}
