import type { ChatEvent, ChatMessage } from '@krantho/ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runAgentLoop, toChatHistory } from '../src/assistant/agent-loop.js'
import type { AssistantEvent } from '../src/assistant/protocol.js'
import { type AssistantTool, defineTool } from '../src/assistant/tools/define-tool.js'
import { WritePolicy } from '../src/assistant/write-policy.js'
import { editor } from './assistant/auth.js'
import { FakeChatAdapter, textTurn, toolTurn } from './assistant/fake-chat.js'
import { testConfig, testContext, testStores } from './assistant/fixtures.js'

const echoTool = defineTool({
  name: 'echo',
  label: 'Echo',
  description: 'Echo the text',
  input: z.object({ text: z.string() }),
  role: 'viewer',
  available: () => true,
  describe: (input) => `Echoing ${input.text}`,
  async run(input) {
    return {
      result: { ok: true, echoed: input.text },
      activity: { status: 'done', summary: `Echoed ${input.text}`, documents: [] },
    }
  },
})

const throwingTool = defineTool({
  name: 'explode',
  label: 'Explode',
  description: 'Always fails',
  input: z.object({}),
  role: 'viewer',
  available: () => true,
  describe: () => 'Exploding',
  async run() {
    throw new Error('boom')
  },
})

const limits = testConfig().assistant.limits

interface Run {
  events: AssistantEvent[]
  chat: FakeChatAdapter
}

async function runLoop(
  turns: ChatEvent[][],
  options: { limits?: Partial<typeof limits>; tools?: AssistantTool[]; signal?: AbortSignal } = {},
): Promise<Run> {
  const chat = new FakeChatAdapter(turns)
  const events: AssistantEvent[] = []
  const signal = options.signal ?? new AbortController().signal
  await runAgentLoop({
    chat,
    system: 'system prompt',
    history: [{ role: 'user', content: 'Hello' }],
    tools: options.tools ?? [echoTool, throwingTool],
    run: {
      ctx: testContext(editor, testStores()),
      callId: '',
      writes: new WritePolicy(),
      frame: (_source, text) => text,
      signal,
    },
    limits: { ...limits, ...options.limits },
    emit: (event) => events.push(event),
    signal,
  })
  return { events, chat }
}

function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1]
}

function toolMessages(
  messages: readonly ChatMessage[],
): Array<Extract<ChatMessage, { role: 'tool' }>> {
  return messages.filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool')
}

describe('runAgentLoop', () => {
  it('streams text in order and ends with done end_turn', async () => {
    const { events } = await runLoop([
      [
        { type: 'text', text: 'Hel' },
        { type: 'text', text: 'lo' },
        { type: 'usage', inputTokens: 3, outputTokens: 2 },
        { type: 'stop', reason: 'end_turn', raw: 'end_turn' },
      ],
    ])
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'usage', inputTokens: 3, outputTokens: 2 },
      { type: 'done', reason: 'end_turn' },
    ])
  })

  it('keeps what a later turn says apart from what the earlier turn said', async () => {
    const { events } = await runLoop([
      toolTurn([{ id: 'c1', name: 'echo', input: { text: 'hi' } }], { text: 'Let me check.' }),
      textTurn('Done.'),
    ])

    const said = events
      .filter((e): e is Extract<typeof e, { type: 'text' }> => e.type === 'text')
      .map((e) => e.text)
      .join('')
    expect(said).toBe('Let me check.\n\nDone.')
  })

  it('runs a tool and sends its result with the first turn and its replay unchanged', async () => {
    const replay = {
      provider: 'anthropic' as const,
      data: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }],
    }
    const { events, chat } = await runLoop([
      toolTurn([{ id: 'c1', name: 'echo', input: { text: 'hi' } }], {
        text: 'Let me check.',
        replay,
      }),
      textTurn('Done.'),
    ])

    expect(events.filter((e) => e.type === 'tool')).toEqual([
      { type: 'tool', id: 'c1', tool: 'echo', label: 'Echoing hi' },
    ])
    expect(events).toContainEqual({
      type: 'activity',
      activity: { id: 'c1', tool: 'echo', status: 'done', summary: 'Echoed hi', documents: [] },
    })
    const second = chat.requests[1]
    expect(second?.messages[1]).toEqual({
      role: 'assistant',
      content: 'Let me check.',
      toolCalls: [{ id: 'c1', name: 'echo', input: { text: 'hi' } }],
      replay,
    })
    expect(second?.messages[2]).toEqual({
      role: 'tool',
      toolCallId: 'c1',
      content: JSON.stringify({ ok: true, echoed: 'hi' }),
      isError: false,
    })
    expect(chat.requests[0]?.tools).toEqual(second?.tools)
    expect(last(events)).toEqual({ type: 'done', reason: 'end_turn' })
  })

  it('forbids tool calls on the last allowed turn and stops when the provider ignores it', async () => {
    const call = toolTurn([{ id: 'c', name: 'echo', input: { text: 'x' } }])
    const { events, chat } = await runLoop([call, call], { limits: { maxTurns: 2 } })

    expect(chat.requests.map((request) => request.toolChoice)).toEqual(['auto', 'none'])
    expect(events.slice(-2)).toEqual([
      {
        type: 'error',
        code: 'limit',
        message: 'The assistant stopped after 2 steps. Ask again to continue.',
      },
      { type: 'done', reason: 'limit' },
    ])
  })

  it('stops before the next model call once the request token budget is spent', async () => {
    const { events, chat } = await runLoop(
      [
        toolTurn([{ id: 'c', name: 'echo', input: { text: 'x' } }], {
          usage: { inputTokens: 900, outputTokens: 200 },
        }),
        textTurn('never'),
      ],
      { limits: { maxRequestTokens: 1000 } },
    )
    expect(chat.requests).toHaveLength(1)
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'error', code: 'limit' }),
      { type: 'done', reason: 'limit' },
    ])
  })

  it('answers calls past the tool limit without running them, then forbids tools', async () => {
    const { events, chat } = await runLoop(
      [
        toolTurn([
          { id: 'a', name: 'echo', input: { text: '1' } },
          { id: 'b', name: 'echo', input: { text: '2' } },
        ]),
        textTurn('Answer'),
      ],
      { limits: { maxToolCalls: 1 } },
    )
    expect(events.filter((e) => e.type === 'tool')).toHaveLength(1)
    const results = toolMessages(chat.requests[1]?.messages ?? [])
    expect(JSON.parse(results[1]?.content ?? '{}')).toEqual({
      ok: false,
      error: 'Tool limit reached for this request; answer with what you have.',
    })
    expect(chat.requests[1]?.toolChoice).toBe('none')
  })

  it('reports an unknown tool, invalid input, a throwing tool and unparsable arguments and keeps going', async () => {
    const { events, chat } = await runLoop([
      toolTurn([
        { id: 'u', name: 'no_such_tool', input: {} },
        { id: 'v', name: 'echo', input: { text: 42 } },
        { id: 't', name: 'explode', input: {} },
        { id: 'p', name: 'echo', input: {}, inputError: 'Unexpected token' },
      ]),
      textTurn('Recovered'),
    ])

    const activities = events.flatMap((e) => (e.type === 'activity' ? [e.activity] : []))
    expect(activities.map((a) => [a.id, a.status])).toEqual([
      ['u', 'failed'],
      ['v', 'failed'],
      ['t', 'failed'],
    ])
    const results = toolMessages(chat.requests[1]?.messages ?? []).map((m) => JSON.parse(m.content))
    expect(results[0]).toEqual({ ok: false, error: 'No such tool' })
    expect(results[1].error).toContain('text')
    expect(results[2]).toEqual({ ok: false, error: 'boom' })
    expect(results[3].error).toContain('Arguments were not a JSON object')
    expect(last(events)).toEqual({ type: 'done', reason: 'end_turn' })
  })

  it('ends with the provider error', async () => {
    const { events } = await runLoop([
      [{ type: 'error', code: 'overloaded', message: 'Overloaded', status: 529 }],
    ])
    expect(events).toEqual([
      { type: 'error', code: 'overloaded', message: 'Overloaded' },
      { type: 'done', reason: 'error' },
    ])
  })

  it('names the provider and model when the model does not support tools', async () => {
    const { events } = await runLoop([
      [{ type: 'error', code: 'tools_unsupported', message: 'no tools', status: 400 }],
    ])
    const error = events[0]
    expect(error).toMatchObject({ type: 'error', code: 'tools_unsupported' })
    expect(error?.type === 'error' && error.message).toContain('`fake-model` on `anthropic`')
  })

  it('ends with done aborted when the request is aborted between steps', async () => {
    const abort = new AbortController()
    const abortingTool = defineTool({
      ...echoTool,
      name: 'echo',
      async run() {
        abort.abort()
        return { result: { ok: true }, activity: { status: 'done', summary: 'ok', documents: [] } }
      },
    } as Parameters<typeof defineTool>[0])
    const { events, chat } = await runLoop(
      [toolTurn([{ id: 'c', name: 'echo', input: { text: 'x' } }]), textTurn('never')],
      { tools: [abortingTool], signal: abort.signal },
    )
    expect(chat.requests).toHaveLength(1)
    expect(last(events)).toEqual({ type: 'done', reason: 'aborted' })
  })

  it('reports cumulative usage and estimates input a provider did not report', async () => {
    const { events } = await runLoop([
      toolTurn([{ id: 'c', name: 'echo', input: { text: 'x' } }], {
        usage: { inputTokens: 100, outputTokens: 10 },
      }),
      textTurn('ok', { inputTokens: 0, outputTokens: 7 }),
    ])
    const usage = events.filter((e) => e.type === 'usage')
    expect(usage[0]).toEqual({ type: 'usage', inputTokens: 100, outputTokens: 10 })
    expect(usage[1]).toMatchObject({ type: 'usage', outputTokens: 17 })
    expect(usage[1]?.type === 'usage' && usage[1].inputTokens).toBeGreaterThan(100)
  })
})

describe('toChatHistory', () => {
  it('maps text turns one to one and merges consecutive turns of one role', () => {
    expect(
      toChatHistory([
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'c' },
        { role: 'user', content: 'd' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ])
  })
})
