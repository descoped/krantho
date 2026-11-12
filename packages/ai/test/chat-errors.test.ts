import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isToolsUnsupportedMessage } from '../src/chat-errors.js'
import { OpenAIChatAdapter } from '../src/openai-chat.js'
import type { Provider } from '../src/types.js'
import { collect, jsonResponse, stubFetch } from './chat-fixtures.js'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function adapter(provider: Provider): OpenAIChatAdapter {
  return new OpenAIChatAdapter({
    provider,
    baseUrl: 'http://llm.test',
    apiKey: 'k',
    model: 'm',
    chatPath: '/v1/chat/completions',
    maxTokensParam: 'max_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
    reasoningParam: 'reasoning_effort',
    profile: { reasoningEffort: 'default', reasoningHeadroom: 0, refusable: false },
  })
}

describe('provider HTTP errors', () => {
  async function failWith(status: number, body: unknown, provider: Provider = 'openai') {
    fetchMock.mockResolvedValueOnce(jsonResponse(body, status))
    return collect(adapter(provider).stream({ messages: [{ role: 'user', content: 'Hi' }] }))
  }

  it("reads the message of Gemini's array-shaped error body", async () => {
    const events = await failWith(
      404,
      [
        {
          error: {
            code: 404,
            message: 'models/gemini-2.0-flash is not found',
            status: 'NOT_FOUND',
          },
        },
      ],
      'gemini',
    )
    expect(events).toEqual([
      {
        type: 'error',
        code: 'bad_request',
        message: 'models/gemini-2.0-flash is not found',
        status: 404,
      },
    ])
  })

  it('reports an Ollama model without tools as tools_unsupported', async () => {
    const events = await failWith(
      400,
      {
        error: {
          message: 'registry.ollama.ai/library/gemma:2b does not support tools',
          type: 'api_error',
        },
      },
      'ollama',
    )
    expect(events).toEqual([
      {
        type: 'error',
        code: 'tools_unsupported',
        message: 'registry.ollama.ai/library/gemma:2b does not support tools',
        status: 400,
      },
    ])
  })

  it('reports an OpenRouter model without tool endpoints as tools_unsupported', async () => {
    const events = await failWith(
      404,
      { error: { message: 'No endpoints found that support tool use.', code: 404 } },
      'openrouter',
    )
    expect(events[0]).toMatchObject({ code: 'tools_unsupported', status: 404 })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [503, 'overloaded'],
    [529, 'overloaded'],
    [400, 'bad_request'],
    [500, 'provider'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const events = await failWith(status, { error: { message: 'Nope' } })
    expect(events).toEqual([{ type: 'error', code, message: 'Nope', status }])
  })

  it('falls back to the status when the body has no message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    const events = await collect(
      adapter('openai').stream({ messages: [{ role: 'user', content: 'Hi' }] }),
    )
    expect(events).toEqual([
      { type: 'error', code: 'provider', message: 'LLM API error: 502', status: 502 },
    ])
  })

  it('recognises the tool-use refusals providers send', () => {
    expect(isToolsUnsupportedMessage('llama2 does not support tools')).toBe(true)
    expect(isToolsUnsupportedMessage("This model doesn't support function calling")).toBe(true)
    expect(isToolsUnsupportedMessage('Tools are not supported for this model')).toBe(true)
    expect(isToolsUnsupportedMessage('Function calling is not enabled for this model')).toBe(true)
    expect(
      isToolsUnsupportedMessage(
        "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
      ),
    ).toBe(true)
    expect(isToolsUnsupportedMessage('Invalid API key')).toBe(false)
  })
})
