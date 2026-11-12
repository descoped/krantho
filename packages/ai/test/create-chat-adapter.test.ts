import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicChatAdapter } from '../src/anthropic-chat.js'
import { createChatAdapter } from '../src/create-chat-adapter.js'
import { OpenAIChatAdapter } from '../src/openai-chat.js'
import type { Provider } from '../src/types.js'
import { collect, openaiChunk, sentRequest, sseResponse, stubFetch } from './chat-fixtures.js'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createChatAdapter', () => {
  it('creates the Anthropic adapter with the preset default model', () => {
    const chat = createChatAdapter({ provider: 'anthropic', apiKey: 'sk' })
    expect(chat).toBeInstanceOf(AnthropicChatAdapter)
    expect(chat.provider).toBe('anthropic')
    expect(chat.model).toBe('claude-haiku-4-5')
  })

  it('keeps an explicit model', () => {
    expect(createChatAdapter({ provider: 'openai', model: 'gpt-5' }).model).toBe('gpt-5')
  })

  it.each<[Provider, string, string]>([
    ['openai', 'https://api.openai.com/v1/chat/completions', 'max_completion_tokens'],
    [
      'gemini',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'max_tokens',
    ],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions', 'max_tokens'],
    ['ollama', 'http://localhost:11434/v1/chat/completions', 'max_tokens'],
  ])('%s posts to %s with %s', async (provider, url, maxTokensParam) => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        openaiChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
        openaiChunk('[DONE]'),
      ]),
    )
    const chat = createChatAdapter({ provider, apiKey: 'k' })
    expect(chat).toBeInstanceOf(OpenAIChatAdapter)
    expect(chat.provider).toBe(provider)
    await collect(chat.stream({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 10 }))
    const sent = sentRequest(fetchMock)
    expect(sent.url).toBe(url)
    expect(sent.body[maxTokensParam]).toBe(10)
  })

  it('appends the preset path to a configured base URL', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([openaiChunk('[DONE]')]))
    const chat = createChatAdapter({ provider: 'openai', baseUrl: 'http://llm.test' })
    await collect(chat.stream({ messages: [{ role: 'user', content: 'Hi' }] }))
    expect(sentRequest(fetchMock).url).toBe('http://llm.test/v1/chat/completions')
  })

  it('throws on an unknown provider', () => {
    expect(() => createChatAdapter({ provider: 'unknown' as 'openai' })).toThrow(
      'Unknown LLM provider',
    )
  })
})
