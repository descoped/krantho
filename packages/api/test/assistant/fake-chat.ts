import type { ChatAdapter, ChatEvent, ChatRequest, ProviderReplay, ToolCall } from '@krantho/ai'

/**
 * A chat adapter that plays scripted turns and records every request. Each
 * recorded request is a deep copy, so later turns appended by the loop do not
 * change what an earlier call was sent.
 */
export class FakeChatAdapter implements ChatAdapter {
  readonly provider = 'anthropic' as const
  readonly model = 'fake-model'
  readonly requests: ChatRequest[] = []
  private turn = 0

  constructor(private readonly turns: ChatEvent[][]) {}

  async *stream(request: ChatRequest): AsyncIterable<ChatEvent> {
    const { signal, ...rest } = request
    this.requests.push({ ...structuredClone(rest), signal })
    const events = this.turns[this.turn++] ?? textTurn('(no more scripted turns)')
    for (const event of events) {
      if (signal?.aborted) {
        yield { type: 'error', code: 'aborted', message: 'Aborted' }
        return
      }
      yield event
    }
  }
}

/** A turn that answers with text */
export function textTurn(text: string, usage = { inputTokens: 10, outputTokens: 5 }): ChatEvent[] {
  return [
    { type: 'text', text },
    { type: 'usage', ...usage },
    { type: 'stop', reason: 'end_turn', raw: 'end_turn' },
  ]
}

/** A turn that calls tools, with an optional provider replay */
export function toolTurn(
  calls: Array<Pick<ToolCall, 'id' | 'name' | 'input'> & Partial<ToolCall>>,
  options: {
    text?: string
    replay?: ProviderReplay
    usage?: { inputTokens: number; outputTokens: number }
  } = {},
): ChatEvent[] {
  const events: ChatEvent[] = []
  if (options.text) events.push({ type: 'text', text: options.text })
  for (const call of calls) events.push({ type: 'tool_call', call })
  events.push({ type: 'usage', ...(options.usage ?? { inputTokens: 10, outputTokens: 5 }) })
  events.push({ type: 'stop', reason: 'tool_use', raw: 'tool_use', replay: options.replay })
  return events
}
