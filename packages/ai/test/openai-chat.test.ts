import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent, ChatMessage } from '../src/chat-types.js'
import { OpenAIChatAdapter, type OpenAIChatOptions } from '../src/openai-chat.js'
import { collect, openaiChunk, sentRequest, sseResponse, stubFetch } from './chat-fixtures.js'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function adapter(overrides: Partial<OpenAIChatOptions> = {}): OpenAIChatAdapter {
  return new OpenAIChatAdapter({
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    chatPath: '/v1/chat/completions',
    maxTokensParam: 'max_completion_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
    reasoningParam: 'reasoning_effort',
    profile: { reasoningEffort: 'default', reasoningHeadroom: 0, refusable: false },
    ...overrides,
  })
}

const delta = (d: Record<string, unknown>, finish: string | null = null): string =>
  openaiChunk({ choices: [{ index: 0, delta: d, finish_reason: finish }] })

const usage = (prompt: number, completion: number): string =>
  openaiChunk({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion } })

const done = openaiChunk('[DONE]')

async function run(
  chunks: string[],
  options: { adapter?: OpenAIChatAdapter; messages?: ChatMessage[] } = {},
): Promise<ChatEvent[]> {
  fetchMock.mockResolvedValueOnce(sseResponse(chunks))
  const messages = options.messages ?? [{ role: 'user', content: 'Hi' }]
  return collect((options.adapter ?? adapter()).stream({ messages }))
}

const toolCalls = (events: ChatEvent[]) =>
  events.flatMap((e) => (e.type === 'tool_call' ? [e.call] : []))

describe('OpenAIChatAdapter request', () => {
  it('posts a streaming request with tools as functions and the usage option', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
    const tool = { name: 'get_document', description: 'Read one', inputSchema: { type: 'object' } }
    await collect(
      adapter().stream({
        system: 'You help.',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        toolChoice: 'none',
        maxTokens: 700,
      }),
    )
    const { url, headers, body } = sentRequest(fetchMock)
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headers.authorization).toBe('Bearer sk-test')
    expect(body).toEqual({
      model: 'gpt-4o',
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: 'You help.' },
        { role: 'user', content: 'Hi' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_document',
            description: 'Read one',
            parameters: { type: 'object' },
          },
        },
      ],
      tool_choice: 'none',
      max_completion_tokens: 700,
    })
  })

  it('uses max_tokens where the preset says so and sends no auth header without a key', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
    const ollama = adapter({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: undefined,
      maxTokensParam: 'max_tokens',
    })
    await collect(ollama.stream({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 64 }))
    const { headers, body } = sentRequest(fetchMock)
    expect(headers.authorization).toBeUndefined()
    expect(body.max_tokens).toBe(64)
    expect(body).not.toHaveProperty('max_completion_tokens')
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('sends assistant tool calls and tool results', async () => {
    await run([delta({}, 'stop'), done], {
      messages: [
        { role: 'user', content: 'Read about' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'get_document', input: { slug: 'about' } }],
        },
        { role: 'tool', toolCallId: 'call_1', content: '{"ok":false}', isError: true },
      ],
    })
    expect(sentRequest(fetchMock).body.messages).toEqual([
      { role: 'user', content: 'Read about' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_document', arguments: '{"slug":"about"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":false}' },
    ])
  })
})

describe('OpenAIChatAdapter stream', () => {
  it('emits text, then usage and stop at [DONE]', async () => {
    const events = await run([
      delta({ role: 'assistant', content: '' }),
      delta({ content: 'Hel' }),
      delta({ content: 'lo' }),
      delta({}, 'stop'),
      usage(9, 2),
      done,
    ])
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'usage', inputTokens: 9, outputTokens: 2 },
      { type: 'stop', reason: 'end_turn', raw: 'stop' },
    ])
  })

  it('accumulates tool call arguments across chunks by index', async () => {
    const events = await run([
      delta({
        tool_calls: [
          {
            index: 0,
            id: 'call_a',
            type: 'function',
            function: { name: 'get_document', arguments: '' },
          },
        ],
      }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '{"slug":' } }] }),
      delta({
        tool_calls: [
          {
            index: 1,
            id: 'call_b',
            type: 'function',
            function: { name: 'search', arguments: '{"q"' },
          },
        ],
      }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '"about"}' } }] }),
      delta({ tool_calls: [{ index: 1, function: { arguments: ':"hours"}' } }] }),
      delta({}, 'tool_calls'),
      usage(20, 10),
      done,
    ])
    expect(toolCalls(events)).toEqual([
      { id: 'call_a', name: 'get_document', input: { slug: 'about' } },
      { id: 'call_b', name: 'search', input: { q: 'hours' } },
    ])
    expect(events.slice(-2)).toEqual([
      { type: 'usage', inputTokens: 20, outputTokens: 10 },
      { type: 'stop', reason: 'tool_use', raw: 'tool_calls' },
    ])
  })

  it('keeps Gemini calls without index apart and sends their thought signatures back', async () => {
    const gemini = adapter({
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      chatPath: '/chat/completions',
      maxTokensParam: 'max_tokens',
      openObjects: 'json_string',
    })
    const signature = { google: { thought_signature: 'CiQB0e2Kb7' } }
    const events = await run(
      [
        delta({
          tool_calls: [
            {
              id: 'fn_1',
              type: 'function',
              function: { name: 'get_document', arguments: '{"slug":"a"}' },
              extra_content: signature,
            },
            {
              id: 'fn_2',
              type: 'function',
              function: { name: 'get_document', arguments: '{"slug":"b"}' },
            },
          ],
        }),
        delta({}, 'stop'),
        done,
      ],
      { adapter: gemini },
    )
    const calls = toolCalls(events)
    expect(calls).toEqual([
      {
        id: 'fn_1',
        name: 'get_document',
        input: { slug: 'a' },
        extra: { extra_content: signature },
      },
      { id: 'fn_2', name: 'get_document', input: { slug: 'b' } },
    ])
    expect(events.at(-1)).toEqual({ type: 'stop', reason: 'tool_use', raw: 'stop' })

    await run([delta({ content: 'ok' }, 'stop'), done], {
      adapter: gemini,
      messages: [
        { role: 'user', content: 'Read a and b' },
        { role: 'assistant', content: '', toolCalls: calls },
        { role: 'tool', toolCallId: 'fn_1', content: 'A' },
        { role: 'tool', toolCallId: 'fn_2', content: 'B' },
      ],
    })
    const next = sentRequest(fetchMock, 1)
    expect(next.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    )
    const assistant = (next.body.messages as Array<Record<string, unknown>>)[1]
    expect(assistant?.tool_calls).toEqual([
      {
        id: 'fn_1',
        type: 'function',
        function: { name: 'get_document', arguments: '{"slug":"a"}' },
        extra_content: signature,
      },
      {
        id: 'fn_2',
        type: 'function',
        function: { name: 'get_document', arguments: '{"slug":"b"}' },
      },
    ])
  })

  it('carries OpenRouter reasoning_details in stop.replay and replays them on the turn', async () => {
    const openrouter = adapter({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api',
      maxTokensParam: 'max_tokens',
    })
    const details = [
      { type: 'reasoning.text', text: 'Need the page.', index: 0, format: 'anthropic-claude-v1' },
      { type: 'reasoning.encrypted', data: 'gAAAAB', index: 1, format: 'anthropic-claude-v1' },
    ]
    const events = await run(
      [
        ': OPENROUTER PROCESSING\n\n',
        delta({ reasoning_details: [details[0]] }),
        delta({ reasoning_details: [details[1]] }),
        delta({
          tool_calls: [
            { index: 0, id: 'call_r', function: { name: 'get_document', arguments: '{}' } },
          ],
        }),
        delta({}, 'tool_calls'),
        done,
      ],
      { adapter: openrouter },
    )
    const stop = events.at(-1)
    if (stop?.type !== 'stop') throw new Error('expected a stop event')
    expect(stop.replay).toEqual({ provider: 'openrouter', data: { reasoning_details: details } })

    await run([delta({ content: 'ok' }, 'stop'), done], {
      adapter: openrouter,
      messages: [
        { role: 'user', content: 'Go' },
        {
          role: 'assistant',
          content: 'Reading.',
          toolCalls: toolCalls(events),
          replay: stop.replay,
        },
        { role: 'tool', toolCallId: 'call_r', content: 'A' },
      ],
    })
    const assistant = (sentRequest(fetchMock, 1).body.messages as Array<Record<string, unknown>>)[1]
    expect(assistant).toEqual({
      role: 'assistant',
      content: 'Reading.',
      tool_calls: [
        { id: 'call_r', type: 'function', function: { name: 'get_document', arguments: '{}' } },
      ],
      reasoning_details: details,
    })
  })

  it('does not replay state from another provider', async () => {
    await run([delta({}, 'stop'), done], {
      messages: [
        {
          role: 'assistant',
          content: 'Hi',
          replay: { provider: 'openrouter', data: { reasoning_details: [] } },
        },
      ],
    })
    expect(sentRequest(fetchMock).body.messages).toEqual([{ role: 'assistant', content: 'Hi' }])
  })

  it('names calls without an id and reports malformed arguments', async () => {
    const events = await run([
      delta({ tool_calls: [{ index: 0, function: { name: 'a', arguments: '{"x":' } }] }),
      delta({}, 'tool_calls'),
      done,
    ])
    const [call] = toolCalls(events)
    expect(call).toMatchObject({ id: 'call_0', name: 'a', input: {} })
    expect(call?.inputError).toMatch(/not valid JSON/)
  })

  it.each([
    ['length', 'max_tokens'],
    ['content_filter', 'refusal'],
    ['something_else', 'other'],
  ])('maps finish_reason %s to %s', async (raw, reason) => {
    const events = await run([delta({ content: 'x' }, raw), done])
    expect(events.at(-1)).toEqual({ type: 'stop', reason, raw })
  })

  it('completes a turn whose stream closes without [DONE] after a finish reason', async () => {
    const events = await run([delta({ content: 'x' }, 'stop')])
    expect(events.at(-1)).toEqual({ type: 'stop', reason: 'end_turn', raw: 'stop' })
  })

  it('reports a stream that closes before any finish reason', async () => {
    const events = await run([delta({ content: 'x' })])
    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'provider',
      message: 'The provider ended the stream early',
    })
  })

  it('turns a mid-stream error chunk into one error event', async () => {
    const events = await run([
      delta({ content: 'Part' }),
      openaiChunk({
        error: { code: 502, message: 'Upstream provider failed' },
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
      }),
      done,
    ])
    expect(events).toEqual([
      { type: 'text', text: 'Part' },
      { type: 'error', code: 'provider', message: 'Upstream provider failed', status: 502 },
    ])
  })

  it('reports data that is not JSON', async () => {
    const events = await run(['data: {not json\n\n', done])
    expect(events).toEqual([
      { type: 'error', code: 'provider', message: 'The provider sent an event that is not JSON' },
    ])
  })
})

/** The `tools` of a request body, as the adapter declares them */
type DeclaredTools = Array<{ function: { parameters?: unknown } }>

describe('OpenAIChatAdapter provider capabilities', () => {
  const tool = { name: 'get_document', description: 'Read one', inputSchema: { type: 'object' } }
  const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }]

  it('leaves the tools out of a request that forbids them where tool_choice is not read', async () => {
    // Ollama's OpenAI layer does not read tool_choice, so `none` could not stop a tool call
    const ollama = adapter({ provider: 'ollama', forbidTools: 'omit_tools' })
    fetchMock.mockResolvedValue(sseResponse([delta({}, 'stop'), done]))
    await collect(ollama.stream({ messages, tools: [tool], toolChoice: 'none' }))
    const forbidden = sentRequest(fetchMock, 0).body
    expect(forbidden).not.toHaveProperty('tools')
    expect(forbidden).not.toHaveProperty('tool_choice')

    await collect(ollama.stream({ messages, tools: [tool], toolChoice: 'auto' }))
    const allowed = sentRequest(fetchMock, 1).body
    expect(allowed.tool_choice).toBe('auto')
    expect(allowed.tools).toHaveLength(1)
  })

  it('keeps the tools in a request that forbids them where tool_choice is honored', async () => {
    // OpenRouter: the tools parameter must be in every request that carries tool history
    const openrouter = adapter({ provider: 'openrouter', forbidTools: 'tool_choice' })
    fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
    await collect(openrouter.stream({ messages, tools: [tool], toolChoice: 'none' }))
    const { body } = sentRequest(fetchMock)
    expect(body.tool_choice).toBe('none')
    expect(body.tools).toHaveLength(1)
  })

  describe('an object parameter without named properties, for a provider that rejects it', () => {
    const update = {
      name: 'update_draft',
      description: 'Update a draft',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          fields: { type: 'object', description: 'Field values' },
        },
        required: ['slug', 'fields'],
      },
    }
    const gemini = (): OpenAIChatAdapter =>
      adapter({ provider: 'gemini', openObjects: 'json_string' })

    it('declares it as a JSON string, the rest of the schema as it is', async () => {
      fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
      await collect(gemini().stream({ messages, tools: [update] }))
      const declared = (sentRequest(fetchMock).body.tools as DeclaredTools)[0]
      expect(declared?.function.parameters).toEqual({
        type: 'object',
        properties: {
          slug: { type: 'string' },
          fields: {
            type: 'string',
            description: 'Field values Pass a JSON object, encoded as a string.',
          },
        },
        required: ['slug', 'fields'],
      })
    })

    it('decodes the arguments of a call to a tool declared that way', async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          delta({
            tool_calls: [
              {
                id: 'fn_1',
                type: 'function',
                function: {
                  name: 'update_draft',
                  arguments: JSON.stringify({ slug: 'about', fields: '{"title":"New"}' }),
                },
              },
            ],
          }),
          delta({}, 'stop'),
          done,
        ]),
      )
      const events = await collect(gemini().stream({ messages, tools: [update] }))
      expect(toolCalls(events)[0]?.input).toEqual({ slug: 'about', fields: { title: 'New' } })
    })

    it('accepts an object the model sent anyway, and leaves a string that is not JSON for validation', async () => {
      const call = (fields: unknown): string =>
        delta({
          tool_calls: [
            {
              id: 'fn_1',
              type: 'function',
              function: { name: 'update_draft', arguments: JSON.stringify({ slug: 's', fields }) },
            },
          ],
        })
      fetchMock.mockResolvedValueOnce(
        sseResponse([call({ title: 'As object' }), delta({}, 'stop'), done]),
      )
      const asObject = await collect(gemini().stream({ messages, tools: [update] }))
      expect(toolCalls(asObject)[0]?.input.fields).toEqual({ title: 'As object' })

      fetchMock.mockResolvedValueOnce(sseResponse([call('not json'), delta({}, 'stop'), done]))
      const asText = await collect(gemini().stream({ messages, tools: [update] }))
      expect(toolCalls(asText)[0]?.input.fields).toBe('not json')
    })

    it('sends no parameters for a tool that takes no arguments', async () => {
      const listing = {
        name: 'list_collections',
        description: 'List the collections',
        inputSchema: { type: 'object', properties: {} },
      }
      fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
      await collect(gemini().stream({ messages, tools: [listing] }))
      const declared = (sentRequest(fetchMock).body.tools as DeclaredTools)[0]
      expect(declared?.function).toEqual({
        name: 'list_collections',
        description: 'List the collections',
      })
    })

    it('sends a native provider the schema unchanged', async () => {
      fetchMock.mockResolvedValueOnce(sseResponse([delta({}, 'stop'), done]))
      await collect(adapter().stream({ messages, tools: [update] }))
      const declared = (sentRequest(fetchMock).body.tools as DeclaredTools)[0]
      expect(declared?.function.parameters).toEqual(update.inputSchema)
    })
  })
})
