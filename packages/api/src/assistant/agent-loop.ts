import type {
  ChatAdapter,
  ChatEvent,
  ChatMessage,
  ChatStopReason,
  ChatTool,
  ProviderReplay,
  ToolCall,
} from '@krantho/ai'
import type { AssistantSection } from '@krantho/config'
import type { AssistantChatRequest, AssistantDoneReason } from './protocol.js'
import type { Emit } from './sse-stream.js'
import {
  type AssistantTool,
  type ToolOutcome,
  type ToolRunContext,
  toolDefinitions,
} from './tool-registry.js'
import { failure } from './tools/support.js'

export interface AgentLoopOptions {
  chat: ChatAdapter
  system: string
  /** The client's text turns, mapped to ChatMessages */
  history: readonly ChatMessage[]
  tools: readonly AssistantTool[]
  run: Omit<ToolRunContext, 'spend'>
  limits: AssistantSection['limits']
  emit: Emit
  signal: AbortSignal
}

/** Counters of one chat request */
interface LoopState {
  turns: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  /** Whether an earlier turn of this request said something, so the next turn starts a new paragraph */
  said: boolean
}

/** One model turn as streamed */
type Turn =
  | {
      ok: true
      text: string
      calls: ToolCall[]
      stop: ChatStopReason
      replay?: ProviderReplay | undefined
    }
  | { ok: false }

/**
 * The client's turns as chat messages, one to one; consecutive messages of the
 * same role are merged with a blank line between (providers require alternation).
 */
export function toChatHistory(messages: AssistantChatRequest['messages']): ChatMessage[] {
  const history: ChatMessage[] = []
  for (const message of messages) {
    const last = history[history.length - 1]
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`
    } else {
      history.push({ role: message.role, content: message.content })
    }
  }
  return history
}

/** The provider's error as the user reads it; an unsupported model is named with its provider */
function errorMessage(chat: ChatAdapter, event: Extract<ChatEvent, { type: 'error' }>): string {
  if (event.code !== 'tools_unsupported') return event.message
  return `The model \`${chat.model}\` on \`${chat.provider}\` does not support tool use, which the assistant needs. Choose a model that does in Setup › AI provider, or set assistant.model.`
}

function doneReason(stop: ChatStopReason): AssistantDoneReason {
  if (stop === 'max_tokens' || stop === 'refusal') return stop
  return 'end_turn'
}

/** Count usage toward the budget; a turn reporting no input tokens is estimated from what was sent */
function countUsage(
  o: AgentLoopOptions,
  state: LoopState,
  event: Extract<ChatEvent, { type: 'usage' }>,
  sentChars: number,
): void {
  state.inputTokens += event.inputTokens > 0 ? event.inputTokens : Math.ceil(sentChars / 4)
  state.outputTokens += event.outputTokens
  o.emit({ type: 'usage', inputTokens: state.inputTokens, outputTokens: state.outputTokens })
}

/** Stream one model turn to the client; a provider error ends the request */
async function streamTurn(
  o: AgentLoopOptions,
  messages: readonly ChatMessage[],
  definitions: readonly ChatTool[],
  state: LoopState,
): Promise<Turn> {
  const lastTurn = state.turns === o.limits.maxTurns
  const toolChoice = state.toolCalls >= o.limits.maxToolCalls || lastTurn ? 'none' : 'auto'
  const request = {
    system: o.system,
    messages,
    tools: definitions,
    toolChoice,
    maxTokens: o.limits.maxTokens,
    signal: o.signal,
  } as const
  const sentChars = JSON.stringify([o.system, messages, definitions]).length

  let text = ''
  const calls: ToolCall[] = []
  let stop: ChatStopReason = 'other'
  let replay: ProviderReplay | undefined
  for await (const event of o.chat.stream(request)) {
    if (event.type === 'text') {
      // A turn after tool calls continues the answer: keep it apart from what the last turn said
      if (text === '' && state.said) o.emit({ type: 'text', text: '\n\n' })
      text += event.text
      o.emit({ type: 'text', text: event.text })
    } else if (event.type === 'tool_call') {
      calls.push(event.call)
    } else if (event.type === 'usage') {
      countUsage(o, state, event, sentChars)
    } else if (event.type === 'stop') {
      stop = event.reason
      replay = event.replay
    } else {
      o.emit({ type: 'error', code: event.code, message: errorMessage(o.chat, event) })
      o.emit({ type: 'done', reason: event.code === 'aborted' ? 'aborted' : 'error' })
      return { ok: false }
    }
  }
  return { ok: true, text, calls, stop, replay }
}

/** Validate a call's input with the tool's schema, then run it; a failure never ends the stream */
export async function executeTool(
  tool: AssistantTool,
  input: Record<string, unknown>,
  run: ToolRunContext,
): Promise<ToolOutcome> {
  const parsed = tool.input.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`,
    )
    return failure(`Invalid arguments — ${issues.join('; ')}`)
  }
  try {
    return await tool.run(parsed.data, run)
  } catch (err: unknown) {
    return failure(err instanceof Error ? err.message : 'The tool failed')
  }
}

/** A result as the model receives it: JSON within the per-result limit */
function resultContent(result: Record<string, unknown>, limit: number): string {
  const content = JSON.stringify(result)
  if (content.length <= limit) return content
  return JSON.stringify({ ok: false, error: 'Result too large; narrow the request' })
}

function toolMessage(call: ToolCall, result: Record<string, unknown>, limit: number): ChatMessage {
  return {
    role: 'tool',
    toolCallId: call.id,
    content: resultContent(result, limit),
    isError: result['ok'] === false,
  }
}

/** Run one tool call within the request's limits and report it to the client */
async function runToolCall(
  o: AgentLoopOptions,
  call: ToolCall,
  state: LoopState,
): Promise<ChatMessage> {
  const limit = o.limits.toolResultChars
  if (state.toolCalls >= o.limits.maxToolCalls) {
    return toolMessage(
      call,
      { ok: false, error: 'Tool limit reached for this request; answer with what you have.' },
      limit,
    )
  }
  if (call.inputError) {
    return toolMessage(
      call,
      { ok: false, error: `Arguments were not a JSON object: ${call.inputError}` },
      limit,
    )
  }
  const tool = o.tools.find((candidate) => candidate.name === call.name)
  if (!tool) {
    const summary = `No tool named ${call.name}`
    o.emit({
      type: 'activity',
      activity: { id: call.id, tool: call.name, status: 'failed', summary, documents: [] },
    })
    return toolMessage(call, { ok: false, error: 'No such tool' }, limit)
  }

  state.toolCalls++
  const parsed = tool.input.safeParse(call.input)
  const label = parsed.success ? tool.describe(parsed.data) : tool.name
  o.emit({ type: 'tool', id: call.id, tool: tool.name, label })
  const spend = (usage: { inputTokens: number; outputTokens: number }): void => {
    state.inputTokens += usage.inputTokens
    state.outputTokens += usage.outputTokens
  }
  const outcome = await executeTool(tool, call.input, { ...o.run, callId: call.id, spend })
  o.emit({ type: 'activity', activity: { id: call.id, tool: tool.name, ...outcome.activity } })
  return toolMessage(call, outcome.result, limit)
}

/**
 * The agent loop of one chat request: model turns streamed to the client, the
 * tools they call run in order, bounded by turns, tool calls and tokens. The
 * last allowed turn and every turn after the tool limit forbid tool calls, so
 * the request ends with an answer.
 */
export async function runAgentLoop(o: AgentLoopOptions): Promise<void> {
  const messages: ChatMessage[] = [...o.history]
  const definitions = toolDefinitions(o.tools)
  const state: LoopState = { turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, said: false }

  while (state.turns < o.limits.maxTurns) {
    state.turns++
    if (o.signal.aborted) {
      o.emit({ type: 'done', reason: 'aborted' })
      return
    }
    if (state.inputTokens + state.outputTokens >= o.limits.maxRequestTokens) {
      const message = 'The assistant used its token budget for this request. Ask again to continue.'
      o.emit({ type: 'error', code: 'limit', message })
      o.emit({ type: 'done', reason: 'limit' })
      return
    }

    const turn = await streamTurn(o, messages, definitions, state)
    if (!turn.ok) return
    if (turn.text !== '') state.said = true
    if (turn.calls.length === 0) {
      o.emit({ type: 'done', reason: doneReason(turn.stop) })
      return
    }

    messages.push({
      role: 'assistant',
      content: turn.text,
      toolCalls: turn.calls,
      replay: turn.replay,
    })
    for (const call of turn.calls) messages.push(await runToolCall(o, call, state))
  }

  const message = `The assistant stopped after ${o.limits.maxTurns} steps. Ask again to continue.`
  o.emit({ type: 'error', code: 'limit', message })
  o.emit({ type: 'done', reason: 'limit' })
}
