import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLLMAdapter } from '../src/create-adapter.js'
import { createChatAdapter } from '../src/create-chat-adapter.js'
import { resolveModelProfile } from '../src/model-profile.js'
import { collect, openaiChunk, sentRequest, sseResponse, stubFetch } from './chat-fixtures.js'

/**
 * The effort each model family is asked for is what the OpenAI API accepted when each was
 * called with it: a model rejects an effort it does not support, and gpt-5 and later reject a
 * temperature and max_tokens.
 */
describe('the default profile of an OpenAI model', () => {
  const effortOf = (model: string) => resolveModelProfile('openai', model).reasoningEffort

  it.each([
    ['gpt-5', 'minimal'],
    ['gpt-5-mini', 'minimal'],
    ['gpt-5-nano', 'minimal'],
    ['gpt-5-2025-08-07', 'minimal'],
    ['gpt-5.1', 'none'],
    ['gpt-5.2', 'none'],
    ['gpt-5.4-mini', 'none'],
    ['gpt-5.5', 'none'],
    ['gpt-5.6-sol', 'none'],
    ['gpt-6-sol', 'none'],
    ['gpt-6-luna', 'none'],
    ['gpt-6-astra', 'low'],
    ['gpt-6.1-sol', 'low'],
    ['o1', 'low'],
    ['o3', 'low'],
    ['o4-mini', 'low'],
  ])('asks %s for %s', (model, effort) => {
    expect(effortOf(model)).toBe(effort)
  })

  it.each(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'a-future-family'])(
    'sends %s no reasoning setting',
    (model) => {
      expect(effortOf(model)).toBe('default')
    },
  )

  it('gives headroom to the models that reason even at their lowest effort, and to no others', () => {
    const headroom = (model: string) => resolveModelProfile('openai', model).reasoningHeadroom
    expect(headroom('gpt-6-astra')).toBeGreaterThan(0)
    expect(headroom('o4-mini')).toBeGreaterThan(headroom('gpt-6-astra'))
    expect(headroom('gpt-5-mini')).toBe(0)
    expect(headroom('gpt-5.5')).toBe(0)
    expect(headroom('gpt-4o')).toBe(0)
  })

  it('sends no temperature unless the site sets one', () => {
    expect(resolveModelProfile('openai', 'gpt-5.5').temperature).toBeUndefined()
  })
})

/**
 * Gemini and Ollama follow their documentation: Gemini's OpenAI-compatible `reasoning_effort`
 * (none is documented for 2.5 only; 2.5 Pro and Gemini 3 cannot turn thinking off) and
 * Ollama's mapping of `none` to no thinking.
 */
describe('the default profile of a Gemini or Ollama model', () => {
  const profile = (provider: 'gemini' | 'ollama', model: string) =>
    resolveModelProfile(provider, model)

  it.each([
    ['gemini-2.5-flash', 'none'],
    ['gemini-2.5-flash-lite', 'none'],
    ['gemini-2.5-pro', 'low'],
    ['gemini-3.5-flash-lite', 'minimal'],
    ['gemini-3.5-flash', 'minimal'],
    ['gemini-3.6-flash', 'minimal'],
    ['gemini-3-flash-preview', 'minimal'],
    ['gemini-3.7-flash', 'low'],
    ['gemini-3.8-flash', 'low'],
    ['gemini-3.1-pro-preview', 'low'],
    ['gemini-3-pro-preview', 'low'],
  ])('asks %s for %s', (model, effort) => {
    expect(profile('gemini', model).reasoningEffort).toBe(effort)
  })

  it('gives headroom to the Gemini models that cannot stop thinking', () => {
    expect(profile('gemini', 'gemini-2.5-pro').reasoningHeadroom).toBeGreaterThan(0)
    expect(profile('gemini', 'gemini-3.1-pro-preview').reasoningHeadroom).toBeGreaterThan(0)
    expect(profile('gemini', 'gemini-2.5-flash').reasoningHeadroom).toBe(0)
  })

  it.each([
    ['qwen3:8b', 'none'],
    ['gemma4', 'none'],
    ['gpt-oss:20b', 'low'],
    ['llama3.1', 'default'],
    ['mistral', 'default'],
  ])('asks the Ollama model %s for %s', (model, effort) => {
    expect(profile('ollama', model).reasoningEffort).toBe(effort)
  })

  it('marks what the documentation gave, and not what the API confirmed', () => {
    expect(profile('gemini', 'gemini-3.6-flash').refusable).toBe(true)
    expect(profile('ollama', 'qwen3').refusable).toBe(true)
    expect(resolveModelProfile('openai', 'gpt-5-mini').refusable).toBe(false)
  })
})

describe('the default profile of an OpenRouter model', () => {
  const profile = (model: string) => resolveModelProfile('openrouter', model)

  it('takes the rule of the vendor whose model it routes to', () => {
    expect(profile('openai/gpt-5-mini').reasoningEffort).toBe('minimal')
    expect(profile('openai/gpt-5.5').reasoningEffort).toBe('none')
    expect(profile('openai/o4-mini')).toMatchObject({
      reasoningEffort: 'low',
      reasoningHeadroom: 4096,
    })
    expect(profile('google/gemini-3.6-flash').reasoningEffort).toBe('minimal')
  })

  it('is refusable even for a rule checked against the vendor itself', () => {
    expect(profile('openai/gpt-5-mini').refusable).toBe(true)
  })

  it('sends nothing for a model of another vendor, or a bare id', () => {
    expect(profile('anthropic/claude-haiku-4.5').reasoningEffort).toBe('default')
    expect(profile('deepseek/deepseek-r1').reasoningEffort).toBe('default')
    expect(profile('gpt-5-mini').reasoningEffort).toBe('default')
  })
})

describe('a site override', () => {
  it('replaces what it sets and keeps the rest of the default', () => {
    const profile = resolveModelProfile('openai', 'gpt-5-mini', {
      'gpt-5-mini': { reasoningEffort: 'high', reasoningHeadroom: 4096 },
    })
    expect(profile).toMatchObject({ reasoningEffort: 'high', reasoningHeadroom: 4096 })
    const partial = resolveModelProfile('openai', 'gpt-6-astra', {
      'gpt-6-astra': { reasoningEffort: 'medium' },
    })
    expect(partial).toMatchObject({ reasoningEffort: 'medium', reasoningHeadroom: 1024 })
  })

  it('applies to the model it names only', () => {
    const profile = resolveModelProfile('openai', 'gpt-5.5', {
      'gpt-5-mini': { reasoningEffort: 'high' },
    })
    expect(profile.reasoningEffort).toBe('none')
  })

  it('can send nothing, or a temperature', () => {
    const profile = resolveModelProfile('openai', 'gpt-5.1', {
      'gpt-5.1': { reasoningEffort: 'default', temperature: 0.3 },
    })
    expect(profile).toMatchObject({ reasoningEffort: 'default', temperature: 0.3 })
  })

  it('leaves a part it sets to undefined as the default has it', () => {
    const profile = resolveModelProfile('openai', 'gpt-5-mini', {
      'gpt-5-mini': { reasoningEffort: undefined },
    })
    expect(profile.reasoningEffort).toBe('minimal')
  })

  it('takes temperature and effort on a provider of the OpenAI wire that reads reasoning', () => {
    const profile = resolveModelProfile('gemini', 'gemini-3.6-flash', {
      'gemini-3.6-flash': { temperature: 1, reasoningEffort: 'high' },
    })
    expect(profile).toMatchObject({ temperature: 1, reasoningEffort: 'high', refusable: false })
  })

  it('is refused for an effort on a provider whose wire has none', () => {
    expect(() =>
      resolveModelProfile('anthropic', 'claude-haiku-4-5', {
        'claude-haiku-4-5': { reasoningEffort: 'low' },
      }),
    ).toThrow('does not apply to the anthropic provider')
  })

  it('is refused for a provider on the Anthropic wire', () => {
    expect(() =>
      resolveModelProfile('anthropic', 'claude-haiku-4-5', {
        'claude-haiku-4-5': { temperature: 0.2 },
      }),
    ).toThrow('does not apply to the anthropic provider')
  })

  it('is not checked for a model no request goes to', () => {
    expect(() =>
      resolveModelProfile('anthropic', 'claude-haiku-4-5', { 'other-model': { temperature: 0.2 } }),
    ).not.toThrow()
  })
})

describe('the request a profile shapes', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function chatBody(
    model: string,
    profiles?: Record<string, { temperature?: number; reasoningEffort?: 'default' | 'low' }>,
    provider: 'openai' | 'gemini' = 'openai',
  ): Promise<Record<string, unknown>> {
    fetchMock.mockResolvedValueOnce(sseResponse([openaiChunk('[DONE]')]))
    const chat = createChatAdapter({ provider, apiKey: 'k', model, profiles })
    await collect(chat.stream({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 100 }))
    return sentRequest(fetchMock).body
  }

  async function completionBody(model: string): Promise<Record<string, unknown>> {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model,
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    await createLLMAdapter({ provider: 'openai', apiKey: 'k', model }).complete('Hi', {
      maxTokens: 100,
    })
    return sentRequest(fetchMock).body
  }

  it('asks a reasoning model for its lowest effort, in max_completion_tokens', async () => {
    const body = await chatBody('gpt-5-mini')
    expect(body.reasoning_effort).toBe('minimal')
    expect(body.max_completion_tokens).toBe(100)
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('temperature')
  })

  it('adds the headroom to the cap of a model that reasons at its lowest effort', async () => {
    const body = await chatBody('gpt-6-astra')
    expect(body.reasoning_effort).toBe('low')
    expect(body.max_completion_tokens).toBe(100 + 1024)
  })

  it('sends a model without a profile nothing it did not send before', async () => {
    const body = await chatBody('gpt-4o')
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.max_completion_tokens).toBe(100)
  })

  it('sends the temperature a site sets, and no effort when it names default', async () => {
    const body = await chatBody('gpt-5.1', {
      'gpt-5.1': { reasoningEffort: 'default', temperature: 0.4 },
    })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.temperature).toBe(0.4)
  })

  it('sends a provider that is not openai no reasoning effort, whatever the model is called', async () => {
    const body = await chatBody('gpt-5-mini', undefined, 'gemini')
    expect(body).not.toHaveProperty('reasoning_effort')
  })

  it('sends a completion the same: effort and max_completion_tokens, never max_tokens', async () => {
    const body = await completionBody('gpt-5.5')
    expect(body.reasoning_effort).toBe('none')
    expect(body.max_completion_tokens).toBe(100)
    expect(body).not.toHaveProperty('max_tokens')
  })

  it('keeps max_tokens for a provider whose preset names it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'm',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    await createLLMAdapter({ provider: 'ollama', model: 'llama3.1' }).complete('Hi', {
      maxTokens: 100,
    })
    const body = sentRequest(fetchMock).body
    expect(body.max_tokens).toBe(100)
    expect(body).not.toHaveProperty('max_completion_tokens')
  })

  it('fails when an override sets what the provider cannot take', () => {
    expect(() =>
      createChatAdapter({
        provider: 'anthropic',
        apiKey: 'k',
        model: 'claude-haiku-4-5',
        profiles: { 'claude-haiku-4-5': { temperature: 0.2 } },
      }),
    ).toThrow('does not apply to the anthropic provider')
  })
})
