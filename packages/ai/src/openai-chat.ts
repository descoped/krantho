import { chatErrorCode, isToolsUnsupportedMessage } from './chat-errors.js'
import {
  earlyEndError,
  isRecord,
  malformedEventError,
  parseEventData,
  parseToolInput,
  recordAt,
  streamChatTurn,
  stringAt,
  type TurnDecoder,
} from './chat-transport.js'
import type {
  ChatAdapter,
  ChatErrorEvent,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ChatStopReason,
  ChatTool,
  ToolCall,
} from './chat-types.js'
import { type ModelProfile, refusesReasoning, shapeRequest } from './model-profile.js'
import { declareOpenObjects, decodeOpenObjects } from './openai-schema.js'
import type { ProviderPreset } from './providers.js'
import type { ServerSentEvent } from './sse.js'
import type { Provider } from './types.js'

export interface OpenAIChatOptions {
  provider: Provider
  baseUrl: string
  apiKey?: string | undefined
  model: string
  chatPath: string
  maxTokensParam: ProviderPreset['maxTokensParam']
  forbidTools: ProviderPreset['forbidTools']
  openObjects: ProviderPreset['openObjects']
  reasoningParam: ProviderPreset['reasoningParam']
  profile: ModelProfile
}

/** The property paths of each tool declared as JSON strings, by tool name */
type OpenObjectPaths = ReadonlyMap<string, readonly string[][]>

type WireMessage = Record<string, unknown>

/**
 * Streaming, tool-using chat over the OpenAI-compatible Chat Completions API
 * (OpenAI, Gemini, OpenRouter, Ollama).
 *
 * Tool calls are accumulated across chunks — by `index`, or by `id` when a
 * provider sends no index. Gemini's `extra_content` thought signatures and
 * OpenRouter's `reasoning_details` are kept and replayed verbatim.
 */
export class OpenAIChatAdapter implements ChatAdapter {
  readonly provider: Provider
  readonly model: string

  constructor(private readonly options: OpenAIChatOptions) {
    this.provider = options.provider
    this.model = options.model
  }

  stream(request: ChatRequest): AsyncIterable<ChatEvent> {
    return this.turn(request)
  }

  /**
   * One model turn. A reasoning setting from an unchecked default that the provider refuses
   * before the turn starts is dropped, and the turn is sent again without it.
   */
  private async *turn(request: ChatRequest): AsyncGenerator<ChatEvent> {
    let first = true
    for await (const event of this.post(request)) {
      if (first && event.type === 'error' && this.refusedReasoning(event)) {
        yield* this.turn(request)
        return
      }
      first = false
      yield event
    }
  }

  private refusedReasoning(event: ChatErrorEvent): boolean {
    const { profile, baseUrl, model } = this.options
    return refusesReasoning(profile, `${baseUrl}|${model}`, event.status, event.message)
  }

  private post(request: ChatRequest): AsyncIterable<ChatEvent> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`
    const { body, openPaths } = this.requestBody(request)
    return streamChatTurn(
      {
        url: `${this.options.baseUrl}${this.options.chatPath}`,
        headers,
        body,
        signal: request.signal,
      },
      new OpenAITurnDecoder(this.provider, openPaths),
    )
  }

  private requestBody(request: ChatRequest): {
    body: Record<string, unknown>
    openPaths: OpenObjectPaths
  } {
    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: toOpenAIMessages(request, this.provider),
    }
    const openPaths = new Map<string, readonly string[][]>()
    const tools = request.tools ?? []
    // A provider that does not read tool_choice is kept from calling tools by not offering them
    const offered =
      request.toolChoice === 'none' && this.options.forbidTools === 'omit_tools' ? [] : tools
    if (offered.length > 0) {
      body.tools = offered.map((tool) => this.declare(tool, openPaths))
      body.tool_choice = request.toolChoice ?? 'auto'
    }
    const { profile, maxTokensParam, reasoningParam, baseUrl, model } = this.options
    shapeRequest(body, {
      profile,
      maxTokensParam,
      reasoningParam,
      key: `${baseUrl}|${model}`,
      maxTokens: request.maxTokens,
    })
    return { body, openPaths }
  }

  private declare(tool: ChatTool, openPaths: Map<string, readonly string[][]>): WireMessage {
    let parameters: Record<string, unknown> | undefined = tool.inputSchema
    if (this.options.openObjects === 'json_string') {
      const declared = declareOpenObjects(tool)
      parameters = declared.parameters
      if (declared.paths.length > 0) openPaths.set(tool.name, declared.paths)
    }
    const fn: Record<string, unknown> = { name: tool.name, description: tool.description }
    if (parameters !== undefined) fn.parameters = parameters
    return { type: 'function', function: fn }
  }
}

function toOpenAIMessages(request: ChatRequest, provider: Provider): WireMessage[] {
  const out: WireMessage[] = []
  if (request.system !== undefined) out.push({ role: 'system', content: request.system })
  for (const message of request.messages) {
    if (message.role === 'user') out.push({ role: 'user', content: message.content })
    else if (message.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: message.toolCallId, content: message.content })
    } else out.push(assistantMessage(message, provider))
  }
  return out
}

function assistantMessage(
  message: Extract<ChatMessage, { role: 'assistant' }>,
  provider: Provider,
): WireMessage {
  const wire: WireMessage = { role: 'assistant', content: message.content || null }
  const calls = message.toolCalls ?? []
  if (calls.length > 0) {
    wire.tool_calls = calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.input) },
      ...call.extra,
    }))
  }
  const replay = message.replay
  if (replay?.provider === provider && isRecord(replay.data)) Object.assign(wire, replay.data)
  return wire
}

const STOP_REASONS = new Map<string, ChatStopReason>([
  ['stop', 'end_turn'],
  ['tool_calls', 'tool_use'],
  ['function_call', 'tool_use'],
  ['length', 'max_tokens'],
  ['content_filter', 'refusal'],
])

/** A tool call as it is being accumulated from stream chunks */
interface CallSlot {
  index: number | undefined
  id: string
  name: string
  args: string
  extra: Record<string, unknown> | undefined
}

/** The Chat Completions stream state machine for one turn */
class OpenAITurnDecoder implements TurnDecoder {
  done = false
  private readonly calls: CallSlot[] = []
  private readonly reasoning: unknown[] = []
  private finishReason = ''
  private inputTokens = 0
  private outputTokens = 0

  constructor(
    private readonly provider: Provider,
    private readonly openPaths: OpenObjectPaths,
  ) {}

  accept(event: ServerSentEvent): ChatEvent[] {
    if (event.data.trim() === '[DONE]') return this.finish()
    const data = parseEventData(event.data)
    if (data === undefined) return this.fail(malformedEventError())
    if (data.error !== undefined && data.error !== null) return this.fail(streamError(data.error))
    this.readUsage(data)
    const choices = data.choices
    const choice = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : undefined
    if (choice === undefined) return []
    const delta = recordAt(choice, 'delta')
    this.collectToolCalls(delta.tool_calls)
    if (Array.isArray(delta.reasoning_details)) this.reasoning.push(...delta.reasoning_details)
    if (typeof choice.finish_reason === 'string') this.finishReason = choice.finish_reason
    const text = delta.content
    return typeof text === 'string' && text !== '' ? [{ type: 'text', text }] : []
  }

  /** A stream closed without `[DONE]` still completes the turn once a finish reason arrived */
  end(): ChatEvent[] {
    return this.finishReason === '' ? [earlyEndError()] : this.finish()
  }

  private fail(error: ChatErrorEvent): ChatEvent[] {
    this.done = true
    return [error]
  }

  private readUsage(data: Record<string, unknown>): void {
    const usage = data.usage
    if (!isRecord(usage)) return
    if (typeof usage.prompt_tokens === 'number') this.inputTokens = usage.prompt_tokens
    if (typeof usage.completion_tokens === 'number') this.outputTokens = usage.completion_tokens
  }

  private collectToolCalls(value: unknown): void {
    if (!Array.isArray(value)) return
    for (const item of value) {
      if (!isRecord(item)) continue
      const slot = this.slotFor(item)
      const id = stringAt(item, 'id')
      if (id !== '') slot.id = id
      const fn = recordAt(item, 'function')
      const name = stringAt(fn, 'name')
      if (name !== '') slot.name = name
      if (typeof fn.arguments === 'string') slot.args += fn.arguments
      else if (isRecord(fn.arguments)) slot.args += JSON.stringify(fn.arguments)
      if (isRecord(item.extra_content)) {
        slot.extra = { ...slot.extra, extra_content: item.extra_content }
      }
    }
  }

  /** The slot a chunk continues: by `index`, else by `id`, else a new call */
  private slotFor(item: Record<string, unknown>): CallSlot {
    const index = typeof item.index === 'number' ? item.index : undefined
    const id = stringAt(item, 'id')
    const existing =
      index !== undefined
        ? this.calls.find((slot) => slot.index === index)
        : id !== ''
          ? this.calls.find((slot) => slot.index === undefined && slot.id === id)
          : undefined
    if (existing !== undefined) return existing
    const slot: CallSlot = { index, id: '', name: '', args: '', extra: undefined }
    this.calls.push(slot)
    return slot
  }

  private finish(): ChatEvent[] {
    this.done = true
    const calls = this.orderedCalls()
    const events: ChatEvent[] = calls.map((call) => ({ type: 'tool_call', call }))
    events.push({ type: 'usage', inputTokens: this.inputTokens, outputTokens: this.outputTokens })
    const reason = calls.length > 0 ? 'tool_use' : (STOP_REASONS.get(this.finishReason) ?? 'other')
    const stop: Extract<ChatEvent, { type: 'stop' }> = {
      type: 'stop',
      reason,
      raw: this.finishReason,
    }
    if (this.reasoning.length > 0) {
      stop.replay = { provider: this.provider, data: { reasoning_details: this.reasoning } }
    }
    events.push(stop)
    return events
  }

  /** Accumulated calls in index order (calls without an index keep their arrival order) */
  private orderedCalls(): ToolCall[] {
    const keyed = this.calls.map((slot, position) => ({ slot, key: slot.index ?? position }))
    keyed.sort((a, b) => a.key - b.key)
    return keyed.map(({ slot }, position) => {
      const { input: parsed, inputError } = parseToolInput(slot.args)
      const paths = this.openPaths.get(slot.name)
      const input = paths === undefined ? parsed : decodeOpenObjects(parsed, paths)
      const call: ToolCall = { id: slot.id || `call_${String(position)}`, name: slot.name, input }
      if (inputError !== undefined) call.inputError = inputError
      if (slot.extra !== undefined) call.extra = slot.extra
      return call
    })
  }
}

/** A mid-stream `{ error }` chunk (OpenRouter) as one `error` event */
function streamError(error: unknown): ChatErrorEvent {
  const record = isRecord(error) ? error : {}
  const message =
    typeof error === 'string' && error !== ''
      ? error
      : stringAt(record, 'message') || 'The provider reported an error mid-stream'
  const status = typeof record.code === 'number' ? record.code : undefined
  if (status !== undefined) {
    return { type: 'error', code: chatErrorCode(status, message), message, status }
  }
  const code = isToolsUnsupportedMessage(message) ? 'tools_unsupported' : 'provider'
  return { type: 'error', code, message }
}
