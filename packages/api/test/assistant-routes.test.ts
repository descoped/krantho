import { parseServerSentEvents } from '@krantho/ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedUser } from '../src/types.js'
import { admin, editor, viewer } from './assistant/auth.js'
import { asUser, testApi, testConfig, testStores } from './assistant/fixtures.js'
import { storeKey } from './fake-vault.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

type Stores = ReturnType<typeof testStores>

const ASSISTANT_ROUTES: Array<[string, string]> = [
  ['GET', '/api/assistant'],
  ['POST', '/api/assistant/chat'],
  ['POST', '/api/assistant/confirm'],
]

const chatBody = { messages: [{ role: 'user', content: 'Which pages do we have?' }] }

async function storeLlmSettings(
  stores: Stores,
  apiKey: string | null = 'sk-test-key',
): Promise<void> {
  await stores.settings.setSetting('llm.provider', 'openai')
  await stores.settings.setSetting('llm.baseUrl.openai', 'http://llm.test')
  if (apiKey) await storeKey(stores.settings, 'openai', apiKey)
}

/** An OpenAI-format streamed completion, split mid-event */
function openAiStream(): Response {
  const events = [
    { choices: [{ delta: { content: 'We have ' } }] },
    { choices: [{ delta: { content: 'two pages.' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } },
  ]
  const text = `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`
  const encoder = new TextEncoder()
  const middle = Math.floor(text.length / 2)
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, middle)))
        controller.enqueue(encoder.encode(text.slice(middle)))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('the assistant surface when disabled', () => {
  it('registers no routes, lists none in OpenAPI and reports no capability', async () => {
    const stores = testStores()
    const api = testApi(stores, testConfig({ assistant: { enabled: false } }))
    for (const [method, path] of ASSISTANT_ROUTES) {
      expect((await api.handle(asUser(admin, method, path, chatBody))).status).toBe(404)
    }
    const spec = await api.handle(asUser(admin, 'GET', '/api/openapi.json'))
    expect(JSON.stringify(spec.body)).not.toContain('/api/assistant')
    const caps = await api.handle(asUser(admin, 'GET', '/api/capabilities'))
    expect((caps.body as { features: Record<string, string> }).features).not.toHaveProperty(
      'assistant',
    )
  })
})

describe('the assistant surface when enabled', () => {
  it('reports the capability and lists the routes under the Assistant tag', async () => {
    const api = testApi(testStores())
    const caps = await api.handle(asUser(admin, 'GET', '/api/capabilities'))
    expect((caps.body as { features: Record<string, string> }).features['assistant']).toBe(
      'enabled',
    )
    const spec = JSON.stringify((await api.handle(asUser(admin, 'GET', '/api/openapi.json'))).body)
    expect(spec).toContain('/api/assistant/chat')
    expect(spec).toContain('"Assistant"')
  })

  it('refuses the anonymous reader of a site with sign-in', async () => {
    const response = await testApi(testStores()).handle(asUser(undefined, 'GET', '/api/assistant'))
    expect(response.status).toBe(401)
  })

  it('refuses users below assistant.role on every route', async () => {
    const api = testApi(testStores(), testConfig({ assistant: { role: 'editor' } }))
    for (const [method, path] of ASSISTANT_ROUTES) {
      expect((await api.handle(asUser(viewer, method, path, chatBody))).status).toBe(403)
    }
  })

  it('validates the chat request', async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    const api = testApi(stores, testConfig({ assistant: { limits: { maxHistoryMessages: 2 } } }))
    const post = (user: AuthenticatedUser, body: unknown, type?: string) =>
      api.handle(asUser(user, 'POST', '/api/assistant/chat', body, type))

    expect((await post(editor, chatBody, 'text/plain')).status).toBe(415)
    expect((await post(editor, { messages: [] })).status).toBe(400)
    expect((await post(editor, { messages: [{ role: 'assistant', content: 'Hi' }] })).status).toBe(
      400,
    )
    expect((await post(editor, { messages: [{ role: 'tool', content: 'x' }] })).status).toBe(400)
    const long = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]
    expect((await post(editor, { messages: long })).status).toBe(413)
  })

  it('answers 503 without an LLM configured or without a credential', async () => {
    const stores = testStores()
    const api = testApi(stores)
    const unconfigured = await api.handle(asUser(editor, 'POST', '/api/assistant/chat', chatBody))
    expect(unconfigured).toMatchObject({ status: 503, body: { code: 'llm_unconfigured' } })

    await storeLlmSettings(stores, null)
    const noKey = await api.handle(asUser(editor, 'POST', '/api/assistant/chat', chatBody))
    expect(noKey).toMatchObject({ status: 503, body: { code: 'llm_credential_missing' } })
  })

  it('reports the provider, model, credential kind and tools — never the key', async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    // A site that lowers `assistant.role` to viewer: the viewer sees the read tools only
    const api = testApi(stores, testConfig({ assistant: { role: 'viewer' } }))
    const response = await api.handle(asUser(viewer, 'GET', '/api/assistant'))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      configured: true,
      provider: 'openai',
      credential: 'api-key',
    })
    const tools = (response.body as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name,
    )
    expect(tools).toContain('get_document')
    expect(tools).not.toContain('create_draft')
    expect(JSON.stringify(response.body)).not.toContain('sk-test-key')
  })

  it("reports the provider assistant.provider names, with that provider's credential", async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    const config = testConfig({ assistant: { provider: 'gemini', model: 'gemini-2.5-pro' } })
    const api = testApi(stores, config)
    const status = await api.handle(asUser(editor, 'GET', '/api/assistant'))
    expect(status.body).toMatchObject({
      configured: true,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
    })
    // The stored key belongs to openai, so gemini has none
    expect(status.body).toMatchObject({ credential: 'none' })
    const noKey = await api.handle(asUser(editor, 'POST', '/api/assistant/chat', chatBody))
    expect(noKey).toMatchObject({ status: 503, body: { code: 'llm_credential_missing' } })
    expect(JSON.stringify(noKey.body)).toContain('KRANTHO_LLM_GEMINI_API_KEY')
  })

  it('lists the AIs the user can pick from, by plain name, and none that is off', async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    await storeKey(stores.settings, 'anthropic', 'sk-ant-test')
    const response = await testApi(stores).handle(asUser(editor, 'GET', '/api/assistant'))
    const { providers } = response.body as { providers: Array<{ provider: string; label: string }> }
    expect(providers).toEqual([
      { provider: 'anthropic', label: 'Claude' },
      { provider: 'openai', label: 'ChatGPT' },
    ])
    expect(JSON.stringify(response.body)).not.toContain('sk-ant-test')
  })

  it('runs the AI the user picked, and refuses one that is off', async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    const fetchMock = vi.fn(async () => openAiStream())
    vi.stubGlobal('fetch', fetchMock)
    const api = testApi(stores)
    const chat = (provider: string) =>
      api.handle(asUser(editor, 'POST', '/api/assistant/chat', { ...chatBody, provider }))

    expect((await chat('openai')).status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://llm.test/v1/chat/completions')

    const off = await chat('gemini')
    expect(off.status).toBe(503)
    expect(JSON.stringify(off.body)).toContain('not set up')
    expect(
      (
        await api.handle(
          asUser(editor, 'POST', '/api/assistant/chat', { ...chatBody, provider: 7 }),
        )
      ).status,
    ).toBe(400)
  })

  it('streams the model answer as server-sent events', async () => {
    const stores = testStores()
    await storeLlmSettings(stores)
    const fetchMock = vi.fn(async () => openAiStream())
    vi.stubGlobal('fetch', fetchMock)

    const response = await testApi(stores).handle(
      asUser(editor, 'POST', '/api/assistant/chat', chatBody),
    )

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(response.body).toBeInstanceOf(ReadableStream)
    const events: Array<{ event: string; data: unknown }> = []
    for await (const event of parseServerSentEvents(response.body as ReadableStream<Uint8Array>)) {
      events.push({ event: event.event, data: JSON.parse(event.data) })
    }
    expect(events).toEqual([
      { event: 'text', data: { type: 'text', text: 'We have ' } },
      { event: 'text', data: { type: 'text', text: 'two pages.' } },
      { event: 'usage', data: { type: 'usage', inputTokens: 12, outputTokens: 4 } },
      { event: 'done', data: { type: 'done', reason: 'end_turn' } },
    ])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://llm.test/v1/chat/completions')
  })
})
