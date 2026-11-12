import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicChatAdapter } from '../src/anthropic-chat.js'
import type { ChatEvent, ChatMessage } from '../src/chat-types.js'
import {
  anthropicEvent,
  byteStream,
  collect,
  jsonResponse,
  sentRequest,
  sseResponse,
  stubFetch,
} from './chat-fixtures.js'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = (): AnthropicChatAdapter =>
  new AnthropicChatAdapter('https://api.anthropic.com', 'sk-test', 'claude-sonnet-5')

const start = (inputTokens = 12): string =>
  anthropicEvent('message_start', { message: { usage: { input_tokens: inputTokens } } })

const finish = (stopReason: string, outputTokens = 34): string[] => [
  anthropicEvent('message_delta', {
    delta: { stop_reason: stopReason },
    usage: { output_tokens: outputTokens },
  }),
  anthropicEvent('message_stop', {}),
]

const textBlock = (index: number, parts: string[]): string[] => [
  anthropicEvent('content_block_start', { index, content_block: { type: 'text', text: '' } }),
  ...parts.map((text) =>
    anthropicEvent('content_block_delta', { index, delta: { type: 'text_delta', text } }),
  ),
  anthropicEvent('content_block_stop', { index }),
]

const toolBlock = (index: number, id: string, name: string, fragments: string[]): string[] => [
  anthropicEvent('content_block_start', {
    index,
    content_block: { type: 'tool_use', id, name, input: {} },
  }),
  ...fragments.map((partial_json) =>
    anthropicEvent('content_block_delta', {
      index,
      delta: { type: 'input_json_delta', partial_json },
    }),
  ),
  anthropicEvent('content_block_stop', { index }),
]

const thinkingBlock = (index: number): string[] => [
  anthropicEvent('content_block_start', {
    index,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  }),
  anthropicEvent('content_block_delta', {
    index,
    delta: { type: 'thinking_delta', thinking: 'Look up the ' },
  }),
  anthropicEvent('content_block_delta', {
    index,
    delta: { type: 'thinking_delta', thinking: 'page first.' },
  }),
  anthropicEvent('content_block_delta', {
    index,
    delta: { type: 'signature_delta', signature: 'EqQBCgIYAhIM' },
  }),
  anthropicEvent('content_block_stop', { index }),
]

const redactedBlock = (index: number): string[] => [
  anthropicEvent('content_block_start', {
    index,
    content_block: { type: 'redacted_thinking', data: 'EmwKAhgBEgy3va3pzix' },
  }),
  anthropicEvent('content_block_stop', { index }),
]

async function run(chunks: string[], messages?: ChatMessage[]): Promise<ChatEvent[]> {
  fetchMock.mockResolvedValueOnce(sseResponse(chunks))
  return collect(adapter().stream({ messages: messages ?? [{ role: 'user', content: 'Hi' }] }))
}

describe('AnthropicChatAdapter request', () => {
  it('posts a streaming Messages request with tools and no thinking field', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([start(), ...finish('end_turn')]))
    const tool = { name: 'get_document', description: 'Read one', inputSchema: { type: 'object' } }
    await collect(
      adapter().stream({
        system: 'You help.',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        toolChoice: 'none',
        maxTokens: 900,
      }),
    )
    const { url, headers, body } = sentRequest(fetchMock)
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 900,
      stream: true,
      system: 'You help.',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [{ name: 'get_document', description: 'Read one', input_schema: { type: 'object' } }],
      tool_choice: { type: 'none' },
    })
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('output_config')
  })

  it('defaults max_tokens, tool_choice auto, and omits tools and tool_choice without tools', async () => {
    fetchMock.mockResolvedValue(sseResponse([start(), ...finish('end_turn')]))
    const tool = { name: 't', description: 'd', inputSchema: { type: 'object' } }
    await collect(adapter().stream({ messages: [{ role: 'user', content: 'Hi' }], tools: [tool] }))
    fetchMock.mockResolvedValue(sseResponse([start(), ...finish('end_turn')]))
    await collect(adapter().stream({ messages: [{ role: 'user', content: 'Hi' }], tools: [] }))
    const withTools = sentRequest(fetchMock, 0).body
    const without = sentRequest(fetchMock, 1).body
    expect(withTools.max_tokens).toBe(16000)
    expect(withTools.tool_choice).toEqual({ type: 'auto' })
    expect(without).not.toHaveProperty('tools')
    expect(without).not.toHaveProperty('tool_choice')
    expect(without).not.toHaveProperty('system')
  })

  it('sends tool calls as tool_use blocks and groups consecutive tool results', async () => {
    await run(
      [start(), ...finish('end_turn')],
      [
        { role: 'user', content: 'Check two pages' },
        {
          role: 'assistant',
          content: 'Reading both.',
          toolCalls: [
            { id: 'tu_1', name: 'get_document', input: { slug: 'a' } },
            { id: 'tu_2', name: 'get_document', input: { slug: 'b' } },
          ],
        },
        { role: 'tool', toolCallId: 'tu_1', content: '{"ok":true}' },
        { role: 'tool', toolCallId: 'tu_2', content: '{"ok":false}', isError: true },
        { role: 'assistant', content: '', toolCalls: [{ id: 'tu_3', name: 'x', input: {} }] },
        { role: 'tool', toolCallId: 'tu_3', content: 'done' },
      ],
    )
    expect(sentRequest(fetchMock).body.messages).toEqual([
      { role: 'user', content: 'Check two pages' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading both.' },
          { type: 'tool_use', id: 'tu_1', name: 'get_document', input: { slug: 'a' } },
          { type: 'tool_use', id: 'tu_2', name: 'get_document', input: { slug: 'b' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}' },
          { type: 'tool_result', tool_use_id: 'tu_2', content: '{"ok":false}', is_error: true },
        ],
      },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_3', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_3', content: 'done' }] },
    ])
  })

  it('sends an OAuth token as a bearer with the beta header and no x-api-key', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([start(), ...finish('end_turn')]))
    const oauth = new AnthropicChatAdapter('https://api.anthropic.com', 'sk', 'm', 'oat-token')
    await collect(oauth.stream({ messages: [{ role: 'user', content: 'Hi' }] }))
    const { headers } = sentRequest(fetchMock)
    expect(headers.authorization).toBe('Bearer oat-token')
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20')
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('ignores a replay produced by another provider', async () => {
    await run(
      [start(), ...finish('end_turn')],
      [
        {
          role: 'assistant',
          content: 'Hello',
          replay: { provider: 'openrouter', data: { reasoning_details: [] } },
        },
      ],
    )
    expect(sentRequest(fetchMock).body.messages).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
    ])
  })
})

describe('AnthropicChatAdapter stream', () => {
  it('emits text deltas in order, then usage and stop', async () => {
    const events = await run([
      start(7),
      anthropicEvent('ping', {}),
      ...textBlock(0, ['Hel', 'lo ', 'there']),
      ...finish('end_turn', 3),
    ])
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo ' },
      { type: 'text', text: 'there' },
      { type: 'usage', inputTokens: 7, outputTokens: 3 },
      { type: 'stop', reason: 'end_turn', raw: 'end_turn' },
    ])
  })

  it('assembles a tool call from input_json_delta fragments', async () => {
    const events = await run([
      start(),
      ...textBlock(0, ['Let me look.']),
      ...toolBlock(1, 'toolu_1', 'get_document', ['{"collec', 'tion":"pages",', '"slug":"about"}']),
      ...finish('tool_use'),
    ])
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'toolu_1',
          name: 'get_document',
          input: { collection: 'pages', slug: 'about' },
        },
      },
    ])
    expect(events.at(-1)).toMatchObject({ type: 'stop', reason: 'tool_use' })
  })

  it('emits two tool calls from one turn and an empty argument buffer as {}', async () => {
    const events = await run([
      start(),
      ...toolBlock(0, 'toolu_a', 'list_documents', []),
      ...toolBlock(1, 'toolu_b', 'get_document', ['{"slug":"x"}']),
      ...finish('tool_use'),
    ])
    const calls = events.flatMap((e) => (e.type === 'tool_call' ? [e.call] : []))
    expect(calls).toEqual([
      { id: 'toolu_a', name: 'list_documents', input: {} },
      { id: 'toolu_b', name: 'get_document', input: { slug: 'x' } },
    ])
  })

  it('reports malformed or non-object arguments as inputError', async () => {
    const events = await run([
      start(),
      ...toolBlock(0, 'toolu_a', 'a', ['{"slug":']),
      ...toolBlock(1, 'toolu_b', 'b', ['[1,2]']),
      ...finish('tool_use'),
    ])
    const calls = events.flatMap((e) => (e.type === 'tool_call' ? [e.call] : []))
    expect(calls[0]).toMatchObject({ id: 'toolu_a', input: {} })
    expect(calls[0]?.inputError).toMatch(/not valid JSON/)
    expect(calls[1]).toMatchObject({ id: 'toolu_b', input: {} })
    expect(calls[1]?.inputError).toMatch(/not a JSON object/)
  })

  it('keeps thinking out of text and replays the turn blocks verbatim on the next request', async () => {
    const events = await run([
      start(),
      ...thinkingBlock(0),
      ...redactedBlock(1),
      ...textBlock(2, ['Checking.']),
      ...toolBlock(3, 'toolu_9', 'get_document', ['{"slug":"about"}']),
      ...finish('tool_use'),
    ])
    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', text: 'Checking.' }])
    const stop = events.at(-1)
    if (stop?.type !== 'stop') throw new Error('expected a stop event')
    const blocks = [
      {
        type: 'thinking',
        thinking: 'Look up the page first.',
        signature: 'EqQBCgIYAhIM',
      },
      { type: 'redacted_thinking', data: 'EmwKAhgBEgy3va3pzix' },
      { type: 'text', text: 'Checking.' },
      { type: 'tool_use', id: 'toolu_9', name: 'get_document', input: { slug: 'about' } },
    ]
    expect(stop.replay).toEqual({ provider: 'anthropic', data: blocks })

    const call = events.flatMap((e) => (e.type === 'tool_call' ? [e.call] : []))
    await run(
      [start(), ...textBlock(0, ['Done.']), ...finish('end_turn')],
      [
        { role: 'user', content: 'Check about' },
        { role: 'assistant', content: 'Checking.', toolCalls: call, replay: stop.replay },
        { role: 'tool', toolCallId: 'toolu_9', content: '{"ok":true}' },
      ],
    )
    const next = sentRequest(fetchMock, 1).body.messages as Array<{ content: unknown }>
    expect(JSON.stringify(next[1]?.content)).toBe(JSON.stringify(blocks))
  })

  it('attaches no replay to a turn without tool calls', async () => {
    const events = await run([
      start(),
      ...thinkingBlock(0),
      ...textBlock(1, ['Hi']),
      ...finish('end_turn'),
    ])
    expect(events.at(-1)).toEqual({ type: 'stop', reason: 'end_turn', raw: 'end_turn' })
  })

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['stop_sequence', 'end_turn'],
    ['pause_turn', 'other'],
  ])('maps stop reason %s to %s', async (raw, reason) => {
    const events = await run([start(), ...textBlock(0, ['x']), ...finish(raw)])
    expect(events.at(-1)).toEqual({ type: 'stop', reason, raw })
  })

  it('turns a mid-stream error event into one overloaded error', async () => {
    const events = await run([
      start(),
      ...textBlock(0, ['Part']),
      anthropicEvent('error', { error: { type: 'overloaded_error', message: 'Overloaded' } }),
      ...finish('end_turn'),
    ])
    expect(events).toEqual([
      { type: 'text', text: 'Part' },
      { type: 'error', code: 'overloaded', message: 'Overloaded' },
    ])
  })

  it('reports a stream that ends before message_stop', async () => {
    const events = await run([start(), ...textBlock(0, ['Part'])])
    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'provider',
      message: 'The provider ended the stream early',
    })
  })

  it('maps HTTP 401 to auth with the provider message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        401,
      ),
    )
    const events = await collect(adapter().stream({ messages: [{ role: 'user', content: 'Hi' }] }))
    expect(events).toEqual([
      { type: 'error', code: 'auth', message: 'invalid x-api-key', status: 401 },
    ])
  })

  it('maps a rejected fetch to network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const events = await collect(adapter().stream({ messages: [{ role: 'user', content: 'Hi' }] }))
    expect(events).toEqual([{ type: 'error', code: 'network', message: 'fetch failed' }])
  })

  it('ends with aborted when the signal aborts mid-stream', async () => {
    const controller = new AbortController()
    let cancelled = false
    const body = byteStream([start(), ...textBlock(0, ['Part'])], {
      hang: true,
      onCancel: () => {
        cancelled = true
      },
    })
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }))
    const events: ChatEvent[] = []
    const stream = adapter().stream({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: controller.signal,
    })
    for await (const event of stream) {
      events.push(event)
      if (event.type === 'text') setTimeout(() => controller.abort(), 0)
    }
    expect(events).toEqual([
      { type: 'text', text: 'Part' },
      { type: 'error', code: 'aborted', message: 'The request was aborted' },
    ])
    expect(cancelled).toBe(true)
    expect(sentRequest(fetchMock).body).toBeDefined()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('reports aborted without calling the provider when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const events = await collect(
      adapter().stream({ messages: [{ role: 'user', content: 'Hi' }], signal: controller.signal }),
    )
    expect(events).toEqual([{ type: 'error', code: 'aborted', message: 'The request was aborted' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a fetch rejected with AbortError to aborted', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('This operation was aborted', 'AbortError'))
    const events = await collect(adapter().stream({ messages: [{ role: 'user', content: 'Hi' }] }))
    expect(events).toEqual([{ type: 'error', code: 'aborted', message: 'The request was aborted' }])
  })
})
