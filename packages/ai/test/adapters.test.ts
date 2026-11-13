import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicFormatAdapter } from '../src/anthropic-format.js'
import { createLLMAdapter } from '../src/create-adapter.js'
import { createChatAdapter } from '../src/create-chat-adapter.js'
import { OpenAIFormatAdapter } from '../src/openai-format.js'
import { CLAUDE_CODE_MODEL } from '../src/providers.js'
import { structuredComplete } from '../src/structured.js'
import { StructuredOutputUnsupportedError } from '../src/types.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AnthropicFormatAdapter', () => {
  it('sends correct request and parses response', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'sk-test',
      'claude-opus-5',
    )
    const result = await adapter.complete('Hi', { system: 'Be brief' })

    expect(result.text).toBe('Hello world')
    expect(result.usage.inputTokens).toBe(10)
    expect(result.usage.outputTokens).toBe(5)
    expect(result.model).toBe('claude-opus-5')
    expect(result.finishReason).toBe('end_turn')

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.model).toBe('claude-opus-5')
    expect(body.system).toBe('Be brief')
    expect(body.temperature).toBeUndefined()
  })

  it('sends jsonSchema as output_config.format', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '{"ok":true}' }],
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'sk-test',
      'claude-opus-5',
    )
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
    await adapter.complete('Hi', { jsonSchema: schema })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema } })
  })

  it('sends effort inside output_config alongside the format', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_4',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '{"ok":true}' }],
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'sk-test',
      'claude-opus-5',
    )
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
    await adapter.complete('Hi', { jsonSchema: schema, effort: 'low' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema }, effort: 'low' })
  })

  it('omits output_config when neither schema nor effort is given', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_5',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'plain' }],
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'sk-test',
      'claude-opus-5',
    )
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.output_config).toBeUndefined()
  })

  it('throws a refusal error instead of a missing-content error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_3',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-opus-5',
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber' },
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'sk-test',
      'claude-opus-5',
    )
    await expect(adapter.complete('Hi')).rejects.toThrow('refusal: cyber')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ type: 'error', error: { type: 'auth', message: 'Invalid API key' } }, 401),
    )

    const adapter = new AnthropicFormatAdapter(
      'https://api.anthropic.com',
      'bad-key',
      'claude-opus-5',
    )
    await expect(adapter.complete('Hi')).rejects.toThrow('Invalid API key')
  })

  it('sends an OAuth token as a bearer with the OAuth beta header and no x-api-key', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_6',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-haiku-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = createLLMAdapter({
      provider: 'claude-code',
      apiKey: 'sk-console',
      authToken: 'oat-test-token',
    })
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(JSON.parse(init.body as string)).toMatchObject({ model: CLAUDE_CODE_MODEL })
    expect(headers.authorization).toBe('Bearer oat-test-token')
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('anthropic ignores an OAuth token and authenticates with the API key', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_8',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-haiku-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = createLLMAdapter({
      provider: 'anthropic',
      apiKey: 'sk-console',
      authToken: 'oat-test-token',
    })
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-console')
    expect(headers.authorization).toBeUndefined()
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('anthropic with only an OAuth token sends no bearer', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_9',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-haiku-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    await createLLMAdapter({ provider: 'anthropic', authToken: 'oat-test-token' }).complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('sends x-api-key and no bearer when only an API key is given', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_7',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-haiku-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )

    const adapter = createLLMAdapter({ provider: 'anthropic', apiKey: 'sk-console' })
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-console')
    expect(headers.authorization).toBeUndefined()
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('keeps the OAuth token out of thrown errors', async () => {
    const token = 'oat-secret-token-value'
    const adapter = createLLMAdapter({ provider: 'claude-code', authToken: token })

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ type: 'error', error: { type: 'auth', message: 'invalid token' } }, 401),
    )
    const apiError = await adapter.complete('Hi').catch((err: unknown) => err as Error)
    expect(apiError.message).toBe('invalid token')

    mockFetch.mockResolvedValueOnce(new Response('gateway down', { status: 502 }))
    const statusError = await adapter.complete('Hi').catch((err: unknown) => err as Error)
    expect(statusError.message).toBe('Anthropic API error: 502')

    for (const err of [apiError, statusError]) {
      expect(err.message).not.toContain(token)
      expect(String(err.stack)).not.toContain(token)
    }
  })
})

describe('claude-code provider', () => {
  it('requires a subscription token and never uses an API key', () => {
    expect(() => createLLMAdapter({ provider: 'claude-code' })).toThrow(/claude setup-token/)
    expect(() => createLLMAdapter({ provider: 'claude-code', apiKey: 'sk-console' })).toThrow(
      /subscription token/,
    )
    expect(() => createChatAdapter({ provider: 'claude-code', apiKey: 'sk-console' })).toThrow(
      /subscription token/,
    )
  })

  it('is pinned to its model: another model is an error, the pinned one is accepted', () => {
    const other = { provider: 'claude-code', authToken: 't', model: 'claude-opus-5' } as const
    expect(() => createLLMAdapter(other)).toThrow(/only claude-haiku-4-5-20251001/)
    expect(() => createChatAdapter(other)).toThrow(/only claude-haiku-4-5-20251001/)
    const pinned = { provider: 'claude-code', authToken: 't', model: CLAUDE_CODE_MODEL } as const
    expect(() => createLLMAdapter(pinned)).not.toThrow()
    expect(createChatAdapter(pinned).model).toBe(CLAUDE_CODE_MODEL)
    expect(createChatAdapter(pinned).provider).toBe('claude-code')
  })

  it('uses the Anthropic endpoint and the pinned model by default', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'msg_10',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: CLAUDE_CODE_MODEL,
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    await createLLMAdapter({ provider: 'claude-code', authToken: 't' }).complete('Hi')
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: CLAUDE_CODE_MODEL })
  })
})

const PLAIN_PROFILE = {
  reasoningEffort: 'default',
  reasoningHeadroom: 0,
  refusable: false,
} as const

describe('OpenAIFormatAdapter', () => {
  it('sends correct request and parses response', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello world' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      }),
    )

    const adapter = new OpenAIFormatAdapter({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      chatPath: '/v1/chat/completions',
      maxTokensParam: 'max_tokens',
      reasoningParam: 'reasoning_effort',
      profile: PLAIN_PROFILE,
    })
    const result = await adapter.complete('Hi', { system: 'Be brief' })

    expect(result.text).toBe('Hello world')
    expect(result.usage.inputTokens).toBe(8)
    expect(result.usage.outputTokens).toBe(4)
    expect(result.model).toBe('gpt-4o')
    expect(result.finishReason).toBe('stop')

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')

    const body = JSON.parse(init.body as string) as { messages: Array<{ role: string }> }
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]!.role).toBe('system')
    expect(body.messages[1]!.role).toBe('user')
  })

  it('ignores an OAuth token and authenticates with the API key', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-456',
        object: 'chat.completion',
        model: 'gpt-4o',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )

    const adapter = createLLMAdapter({
      provider: 'openai',
      apiKey: 'sk-openai',
      authToken: 'oat-test-token',
    })
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-openai')
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('omits auth header when no API key (Ollama)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'llama3.1',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      }),
    )

    const adapter = new OpenAIFormatAdapter({
      baseUrl: 'http://localhost:11434',
      apiKey: undefined,
      model: 'llama3.1',
      chatPath: '/v1/chat/completions',
      maxTokensParam: 'max_tokens',
      reasoningParam: 'reasoning_effort',
      profile: PLAIN_PROFILE,
    })
    await adapter.complete('Hi')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it("posts Gemini completions to Google's OpenAI-compatible endpoint", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-789',
        object: 'chat.completion',
        model: 'gemini-2.0-flash',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )

    const adapter = createLLMAdapter({ provider: 'gemini', apiKey: 'g-key' })
    await adapter.complete('Hi', { maxTokens: 50 })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.max_tokens).toBe(50)
  })

  describe('structured output', () => {
    const chatReply = (content: string) =>
      jsonResponse({
        id: 'c1',
        object: 'chat.completion',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      })
    /** A model of its own per test: what a provider refuses is remembered by model */
    const adapterFor = (model: string) =>
      new OpenAIFormatAdapter({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        model,
        chatPath: '/v1/chat/completions',
        maxTokensParam: 'max_tokens',
        reasoningParam: 'reasoning_effort',
        profile: PLAIN_PROFILE,
      })
    const closed = {
      type: 'object',
      properties: { description: { type: 'string' } },
      required: ['description'],
      additionalProperties: false,
    }

    it('sends the schema as response_format, strict when every property is required', async () => {
      mockFetch.mockResolvedValue(chatReply('{"description":"Hi"}'))
      const adapter = adapterFor('gpt-structured-strict')
      expect(adapter.supportsJsonSchema).toBe(true)
      await adapter.complete('Write', { jsonSchema: closed })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: { name: 'response', strict: true, schema: closed },
      })
    })

    it('sends the schema as guidance, not strict, when a property is optional', async () => {
      mockFetch.mockResolvedValue(chatReply('{}'))
      const open = { ...closed, required: [] }
      await adapterFor('gpt-structured-loose').complete('Write', { jsonSchema: open })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as {
        response_format: { json_schema: { strict: boolean } }
      }
      expect(body.response_format.json_schema.strict).toBe(false)
    })

    it('sends no response_format when no schema is asked for', async () => {
      mockFetch.mockResolvedValue(chatReply('Hello'))
      await adapterFor('gpt-structured-none').complete('Hi')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string)).not.toHaveProperty('response_format')
    })

    it('parses the reply directly through structuredComplete', async () => {
      mockFetch.mockResolvedValue(chatReply('{"description":"Direct"}'))
      const result = await structuredComplete<{ description: string }>(
        adapterFor('gpt-structured-direct'),
        'Write',
        {
          type: 'object',
          properties: { description: { type: 'string' } },
          required: ['description'],
        },
      )
      expect(result).toEqual({ description: 'Direct' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('falls back to the schema in the prompt for a model that takes no schema, and remembers it', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: {
                message: 'This model does not support response_format json_schema',
                type: 'invalid_request_error',
              },
            },
            400,
          ),
        )
        .mockResolvedValueOnce(chatReply('Here you go:\n```json\n{"description":"Fallback"}\n```'))
      const adapter = adapterFor('gpt-structured-refused')
      const schema = {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description'],
      }

      const result = await structuredComplete<{ description: string }>(adapter, 'Write', schema)

      expect(result).toEqual({ description: 'Fallback' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const [, retry] = mockFetch.mock.calls[1] as [string, RequestInit]
      const retried = JSON.parse(retry.body as string) as {
        messages: Array<{ content: string }>
      }
      expect(retried).not.toHaveProperty('response_format')
      expect(retried.messages.at(-1)?.content).toContain(
        'Respond with a JSON object matching this schema',
      )
      // The model is not asked for a schema again
      expect(adapter.supportsJsonSchema).toBe(false)
      expect(adapterFor('gpt-structured-other').supportsJsonSchema).toBe(true)
    })

    it('goes again without the schema for this one schema, without holding it against the model', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: "Invalid schema for response_format 'response'",
              type: 'invalid_request_error',
            },
          },
          400,
        ),
      )
      const adapter = adapterFor('gpt-structured-badschema')
      await expect(adapter.complete('Write', { jsonSchema: closed })).rejects.toBeInstanceOf(
        StructuredOutputUnsupportedError,
      )
      expect(adapter.supportsJsonSchema).toBe(true)
    })

    it('does not hold a schema error against the model when it says the schema is at fault', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: "Invalid schema for response_format 'response': 'format' is not supported",
              type: 'invalid_request_error',
            },
          },
          400,
        ),
      )
      const adapter = adapterFor('gpt-structured-unsupported-keyword')
      await expect(adapter.complete('Write', { jsonSchema: closed })).rejects.toBeInstanceOf(
        StructuredOutputUnsupportedError,
      )
      expect(adapter.supportsJsonSchema).toBe(true)
    })

    it('reports an error that is not about the schema as it is', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: { message: 'Rate limited', type: 'rate_limit' } }, 429),
      )
      await expect(
        adapterFor('gpt-structured-rate').complete('Write', { jsonSchema: closed }),
      ).rejects.toThrow('Rate limited')
    })

    it('names a refusal when the reply carries no content', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          id: 'c1',
          object: 'chat.completion',
          model: 'm',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null, refusal: 'No.' },
              finish_reason: 'stop',
            },
          ],
        }),
      )
      await expect(
        adapterFor('gpt-structured-refusal').complete('Write', { jsonSchema: closed }),
      ).rejects.toThrow('LLM declined the request: No.')
    })
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'Rate limited', type: 'rate_limit' } }, 429),
    )

    const adapter = new OpenAIFormatAdapter({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      chatPath: '/v1/chat/completions',
      maxTokensParam: 'max_tokens',
      reasoningParam: 'reasoning_effort',
      profile: PLAIN_PROFILE,
    })
    await expect(adapter.complete('Hi')).rejects.toThrow('Rate limited')
  })
})

describe('createLLMAdapter', () => {
  it('creates Anthropic adapter', () => {
    const adapter = createLLMAdapter({ provider: 'anthropic', apiKey: 'sk-test' })
    expect(adapter).toBeInstanceOf(AnthropicFormatAdapter)
  })

  it('creates OpenAI adapter', () => {
    const adapter = createLLMAdapter({ provider: 'openai', apiKey: 'sk-test' })
    expect(adapter).toBeInstanceOf(OpenAIFormatAdapter)
  })

  it('creates Gemini adapter (OpenAI format)', () => {
    const adapter = createLLMAdapter({ provider: 'gemini', apiKey: 'test' })
    expect(adapter).toBeInstanceOf(OpenAIFormatAdapter)
  })

  it('creates OpenRouter adapter (OpenAI format)', () => {
    const adapter = createLLMAdapter({ provider: 'openrouter', apiKey: 'test' })
    expect(adapter).toBeInstanceOf(OpenAIFormatAdapter)
  })

  it('creates Ollama adapter (OpenAI format)', () => {
    const adapter = createLLMAdapter({ provider: 'ollama' })
    expect(adapter).toBeInstanceOf(OpenAIFormatAdapter)
  })

  it('throws on unknown provider', () => {
    expect(() => createLLMAdapter({ provider: 'unknown' as 'openai' })).toThrow(
      'Unknown LLM provider',
    )
  })
})
