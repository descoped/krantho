import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLLMAdapter } from '../src/create-adapter.js'
import { createChatAdapter } from '../src/create-chat-adapter.js'
import type { Provider } from '../src/types.js'
import {
  collect,
  jsonResponse,
  openaiChunk,
  sentRequest,
  sseResponse,
  stubFetch,
} from './chat-fixtures.js'

let fetchMock: ReturnType<typeof vi.fn>
let endpoint = 0

beforeEach(() => {
  fetchMock = stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A base URL no other test uses: a refusal is remembered per endpoint and model */
function freshBaseUrl(): string {
  endpoint += 1
  return `http://case-${String(endpoint)}.test`
}

const ok = () => sseResponse([openaiChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] })])
const completionOk = () =>
  jsonResponse(
    {
      model: 'm',
      choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    },
    200,
  )
const refusal = (message: string, status = 400) => jsonResponse({ error: { message } }, status)

async function chat(provider: Provider, model: string, extra: { profiles?: never } = {}) {
  const baseUrl = freshBaseUrl()
  fetchMock.mockResolvedValueOnce(ok())
  const adapter = createChatAdapter({ provider, apiKey: 'k', model, baseUrl, ...extra })
  await collect(adapter.stream({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 100 }))
  return sentRequest(fetchMock).body
}

describe('the reasoning setting each provider reads', () => {
  it('sends Gemini reasoning_effort and max_tokens', async () => {
    const body = await chat('gemini', 'gemini-3.6-flash')
    expect(body.reasoning_effort).toBe('minimal')
    expect(body.max_tokens).toBe(100)
  })

  it('adds the headroom of a Gemini model that cannot stop thinking', async () => {
    const body = await chat('gemini', 'gemini-2.5-pro')
    expect(body.reasoning_effort).toBe('low')
    expect(body.max_tokens).toBe(100 + 1024)
  })

  it("sends OpenRouter's reasoning object, and not reasoning_effort", async () => {
    const body = await chat('openrouter', 'openai/gpt-5-mini')
    expect(body.reasoning).toEqual({ effort: 'minimal' })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.max_tokens).toBe(100)
  })

  it('sends an OpenRouter model of another vendor nothing', async () => {
    const body = await chat('openrouter', 'anthropic/claude-haiku-4.5')
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('reasoning_effort')
  })

  it('sends Ollama reasoning_effort and max_tokens, never max_completion_tokens', async () => {
    const body = await chat('ollama', 'qwen3:8b')
    expect(body.reasoning_effort).toBe('none')
    expect(body.max_tokens).toBe(100)
    expect(body).not.toHaveProperty('max_completion_tokens')
  })

  it('sends an Ollama model that does not think nothing', async () => {
    const body = await chat('ollama', 'llama3.1')
    expect(body).not.toHaveProperty('reasoning_effort')
  })
})

describe('a reasoning setting the provider refuses', () => {
  it('is dropped from an unchecked default, the turn goes again, and the model is not asked again', async () => {
    const baseUrl = freshBaseUrl()
    fetchMock
      .mockResolvedValueOnce(refusal("Unsupported value: 'reasoning_effort' is not allowed here"))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok())
    const adapter = createChatAdapter({ provider: 'gemini', apiKey: 'k', baseUrl })
    const request = { messages: [{ role: 'user' as const, content: 'Hi' }], maxTokens: 100 }

    const first = await collect(adapter.stream(request))
    expect(first.some((event) => event.type === 'error')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentRequest(fetchMock, 0).body.reasoning_effort).toBe('minimal')
    expect(sentRequest(fetchMock, 1).body).not.toHaveProperty('reasoning_effort')

    await collect(adapter.stream(request))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sentRequest(fetchMock, 2).body).not.toHaveProperty('reasoning_effort')
  })

  it('is dropped from a completion the same way', async () => {
    const baseUrl = freshBaseUrl()
    fetchMock
      .mockResolvedValueOnce(refusal('This model does not support the reasoning parameter'))
      .mockResolvedValueOnce(completionOk())
    const adapter = createLLMAdapter({
      provider: 'openrouter',
      apiKey: 'k',
      model: 'openai/gpt-5-mini',
      baseUrl,
    })
    const result = await adapter.complete('Hi', { maxTokens: 100 })

    expect(result.text).toBe('OK')
    expect(sentRequest(fetchMock, 0).body.reasoning).toEqual({ effort: 'minimal' })
    expect(sentRequest(fetchMock, 1).body).not.toHaveProperty('reasoning')
  })

  it('is not dropped from a setting checked against the provider, which is an error to show', async () => {
    const baseUrl = freshBaseUrl()
    fetchMock.mockResolvedValueOnce(refusal("Unsupported value: 'reasoning_effort'"))
    const adapter = createChatAdapter({
      provider: 'openai',
      apiKey: 'k',
      model: 'gpt-5-mini',
      baseUrl,
    })
    const events = await collect(adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] }))

    expect(events[0]).toMatchObject({ type: 'error', code: 'bad_request' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is not dropped from a setting the site chose', async () => {
    const baseUrl = freshBaseUrl()
    fetchMock.mockResolvedValueOnce(refusal("Unsupported value: 'reasoning_effort'"))
    const adapter = createChatAdapter({
      provider: 'gemini',
      apiKey: 'k',
      baseUrl,
      profiles: { 'gemini-3.6-flash': { reasoningEffort: 'high' } },
    })
    const events = await collect(adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] }))

    expect(events[0]).toMatchObject({ type: 'error' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an error that does not name reasoning', 400, 'Invalid API key format'],
    ['a server error', 500, 'reasoning service unavailable'],
  ])('is not retried for %s', async (_name, status, message) => {
    const baseUrl = freshBaseUrl()
    fetchMock.mockResolvedValueOnce(refusal(message, status))
    const adapter = createChatAdapter({ provider: 'gemini', apiKey: 'k', baseUrl })
    const events = await collect(adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] }))

    expect(events[0]).toMatchObject({ type: 'error' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the error when the retry is refused too', async () => {
    const baseUrl = freshBaseUrl()
    fetchMock
      .mockResolvedValueOnce(refusal('reasoning_effort is not supported'))
      .mockResolvedValueOnce(refusal('Invalid API key', 401))
    const adapter = createChatAdapter({ provider: 'gemini', apiKey: 'k', baseUrl })
    const events = await collect(adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] }))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', code: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
