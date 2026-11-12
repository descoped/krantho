import { CLAUDE_CODE_MODEL, PROVIDER_PRESETS } from '@krantho/ai'
import type { KranthoConfigInput } from '@krantho/config'
import { LLM_PROVIDERS, resolveConfig } from '@krantho/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAdapter, resolveChatAdapter } from '../src/handlers/llm-resolve.js'
import {
  deleteLLMSettings,
  getLLMSettings,
  testLLMConnection,
  updateLLMSettings,
} from '../src/handlers/llm-settings.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { fakeVault } from './fake-vault.js'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

const OAUTH = 'oat-test-token-marker'
const ENV_KEY = 'sk-env-key-marker'
const STORED_KEY = 'sk-stored-key-marker'
const OPENAI_ENV_KEY = 'sk-openai-env-marker'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (url: string) => {
    const body = url.endsWith('/v1/messages')
      ? {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK' }],
          model: 'claude-haiku-4-5',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }
      : {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          model: 'gpt-4o',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

interface Setup {
  /** The provider chosen and stored; null stores none, so the site decides by its keys */
  provider?: string | null
  /** The key stored for the chosen provider */
  storedKey?: string
  /** Keys stored per provider, in addition to `storedKey` */
  stored?: Record<string, string>
  storedModel?: string
  storedBaseUrl?: string
  env?: Record<string, string>
  code?: KranthoConfigInput
  /** The site has no vault, so it opens and stores no key */
  noVault?: boolean
}

/** A handler context whose stored settings and environment are exactly what the case names */
function context(setup: Setup): ApiContext {
  return contextWithStore(setup).ctx
}

function contextWithStore({
  provider = 'anthropic',
  storedKey,
  stored: storedKeys = {},
  storedModel,
  storedBaseUrl,
  env = {},
  code = {},
  noVault = false,
}: Setup): { ctx: ApiContext; stored: Map<string, string> } {
  const stored = new Map<string, string>()
  if (provider !== null) stored.set('llm.provider', provider)
  const sealedKeys = {
    ...storedKeys,
    ...(storedKey === undefined || provider === null ? {} : { [provider]: storedKey }),
  }
  for (const [name, key] of Object.entries(sealedKeys)) {
    stored.set(`llm.apiKey.${name}`, `sealed:llm.apiKey.${name}:${key}`)
  }
  if (storedModel !== undefined) stored.set(`llm.model.${provider ?? 'anthropic'}`, storedModel)
  if (storedBaseUrl !== undefined)
    stored.set(`llm.baseUrl.${provider ?? 'anthropic'}`, storedBaseUrl)
  const ctx = {
    config: resolveConfig({ site, ...code }, env, { cwd: '/srv/site' }),
    secrets: noVault ? undefined : fakeVault,
    siteSettingsAdapter: {
      getSetting: async (key: string) => stored.get(key) ?? null,
      setSetting: async (key: string, value: string) => {
        stored.set(key, value)
      },
    },
    auth: { id: 'u1', email: 'a@example.com', name: 'Admin', roles: ['admin'], mode: 'token' },
  } as unknown as ApiContext
  return { ctx, stored }
}

/** The headers the adapter resolved for `setup` sends on a completion */
async function sentHeaders(setup: Setup): Promise<Record<string, string>> {
  const adapter = await resolveAdapter(context(setup))
  await adapter.complete('Hi')
  const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  return init.headers as Record<string, string>
}

const both = { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH, KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY }

describe('request-time LLM credential', () => {
  it('claude-code uses the subscription token only, never an env or stored key', async () => {
    const headers = await sentHeaders({ provider: 'claude-code', env: both, storedKey: STORED_KEY })
    expect(headers.authorization).toBe(`Bearer ${OAUTH}`)
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20')
    expect(headers['x-api-key']).toBeUndefined()
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ model: CLAUDE_CODE_MODEL })
  })

  it('claude-code without a token, and no other key, fails with the claude setup-token hint', async () => {
    const ctx = context({ provider: 'claude-code' })
    await expect(resolveAdapter(ctx)).rejects.toThrow(
      /claude setup-token.*KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN/s,
    )
  })

  it('claude-code without a token leaves the site on a provider that has a key', async () => {
    const headers = await sentHeaders({
      provider: 'claude-code',
      env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY },
    })
    expect(headers['x-api-key']).toBe(ENV_KEY)
  })

  it('claude-code rejects a stored model that is not the pinned one', async () => {
    const ctx = context({ provider: 'claude-code', env: both, storedModel: 'claude-opus-5' })
    await expect(resolveAdapter(ctx)).rejects.toThrow(/runs only/)
  })

  it('claude-code rejects an assistant.model override that is not the pinned one', async () => {
    const ctx = context({ provider: 'claude-code', env: both })
    await expect(resolveChatAdapter(ctx, { model: 'claude-opus-5' })).rejects.toThrow(/runs only/)
    const { chat, credential } = await resolveChatAdapter(ctx, {})
    expect(chat.model).toBe(CLAUDE_CODE_MODEL)
    expect(credential).toBe('oauth')
  })

  it('anthropic uses the env key over the stored key and ignores the subscription token', async () => {
    const headers = await sentHeaders({ env: both, storedKey: STORED_KEY })
    expect(headers['x-api-key']).toBe(ENV_KEY)
    expect(headers.authorization).toBeUndefined()
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('anthropic falls back to the stored key when the environment sets neither', async () => {
    const headers = await sentHeaders({ storedKey: STORED_KEY })
    expect(headers['x-api-key']).toBe(STORED_KEY)
    expect(headers.authorization).toBeUndefined()
  })

  it('anthropic chosen with only the subscription token has no credential', async () => {
    const env = { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH }
    const { credential } = await resolveChatAdapter(context({ env }), {})
    expect(credential).toBe('none')
    const headers = await sentHeaders({ env })
    expect(headers.authorization).toBeUndefined()
    expect(headers['anthropic-beta']).toBeUndefined()
  })

  it('uses a key the code supplies, over the stored key', async () => {
    const headers = await sentHeaders({
      code: { llm: { anthropic: { apiKey: 'sk-code-key' } } },
      storedKey: STORED_KEY,
    })
    expect(headers['x-api-key']).toBe('sk-code-key')
  })

  it('has no credential from a stored key the site cannot open: no vault, or a key sealed elsewhere', async () => {
    const noVault = await resolveChatAdapter(context({ storedKey: STORED_KEY, noVault: true }), {})
    expect(noVault.credential).toBe('none')

    const { ctx, stored } = contextWithStore({ storedKey: STORED_KEY })
    stored.set('llm.apiKey.anthropic', 'sk-plain-text-from-before')
    expect((await resolveChatAdapter(ctx, {})).credential).toBe('none')
    stored.set('llm.apiKey.anthropic', `sealed:llm.apiKey.openai:${STORED_KEY}`)
    expect((await resolveChatAdapter(ctx, {})).credential).toBe('none')
  })

  it('ignores the subscription token and the anthropic key for another provider', async () => {
    const withEnvKey = await sentHeaders({
      provider: 'openai',
      env: { ...both, KRANTHO_LLM_OPENAI_API_KEY: OPENAI_ENV_KEY },
      storedKey: STORED_KEY,
    })
    expect(withEnvKey.authorization).toBe(`Bearer ${OPENAI_ENV_KEY}`)
    expect(withEnvKey['anthropic-beta']).toBeUndefined()

    mockFetch.mockClear()
    const storedOnly = await sentHeaders({ provider: 'openai', env: both, storedKey: STORED_KEY })
    expect(storedOnly.authorization).toBe(`Bearer ${STORED_KEY}`)
  })

  it('runs the connection test with the same credential', async () => {
    const res = await testLLMConnection(
      { method: 'POST' } as ApiRequest,
      context({ provider: 'claude-code', env: both, storedKey: STORED_KEY }),
    )
    expect(res.body).toMatchObject({ success: true, provider: 'claude-code' })
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${OAUTH}`)
  })

  it('tests the provider it is asked to, not the one in use', async () => {
    const env = { ...both, KRANTHO_LLM_OPENAI_API_KEY: OPENAI_ENV_KEY }
    const res = await testLLMConnection(
      { method: 'POST', body: { provider: 'openai' } } as ApiRequest,
      context({ env }),
    )
    expect(res.body).toMatchObject({ success: true, provider: 'openai' })
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('api.openai.com')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${OPENAI_ENV_KEY}`)
  })

  it('refuses to test an unknown provider, or with none set up', async () => {
    const unknown = await testLLMConnection(
      { method: 'POST', body: { provider: 'mystery' } } as ApiRequest,
      context({}),
    )
    expect(unknown.status).toBe(400)
    const none = await testLLMConnection(
      { method: 'POST' } as ApiRequest,
      context({ provider: null }),
    )
    expect(none.status).toBe(400)
  })
})

describe('llm.profiles', () => {
  const sentBody = async (setup: Setup): Promise<unknown> => {
    const adapter = await resolveAdapter(context(setup))
    await adapter.complete('Hi', { maxTokens: 50 })
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    return JSON.parse(init.body as string)
  }
  const openai = { provider: 'openai', env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY } }

  it('asks a reasoning model for its lowest effort, by default', async () => {
    const body = await sentBody({
      ...openai,
      storedModel: 'gpt-5-mini',
    })
    expect(body).toMatchObject({ reasoning_effort: 'minimal', max_completion_tokens: 50 })
  })

  it("passes the site's override to the adapter", async () => {
    const body = await sentBody({
      ...openai,
      storedModel: 'gpt-5-mini',
      code: { llm: { profiles: { 'gpt-5-mini': { reasoningEffort: 'high' } } } },
    })
    expect(body).toMatchObject({ reasoning_effort: 'high' })
  })
})

describe('claude-code in production', () => {
  it('is refused when resolving the adapters, with the reason', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const ctx = context({
      provider: 'claude-code',
      env: { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH },
    })
    await expect(resolveAdapter(ctx)).rejects.toThrow(/development on your own machine/)
    await expect(resolveChatAdapter(ctx, {})).rejects.toThrow(/anthropic provider/)
  })

  it('does not affect the anthropic provider', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const headers = await sentHeaders({ env: both })
    expect(headers['x-api-key']).toBe(ENV_KEY)
  })

  it('is reported by the connection test as a failure with the reason', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await testLLMConnection(
      { method: 'POST' } as ApiRequest,
      context({ provider: 'claude-code', env: { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH } }),
    )
    expect(res.body).toMatchObject({ success: false })
    expect(JSON.stringify(res.body)).toContain('development on your own machine')
  })

  it('is not on in production, so a site falls to a provider with a key', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const body = await settingsBody({ provider: 'claude-code', env: both })
    expect(providerOf(body, 'claude-code')).toMatchObject({ ready: false })
    expect(body).toMatchObject({ provider: 'anthropic' })
  })
})

describe('the provider list', () => {
  it('is the one @krantho/ai has presets for', () => {
    expect([...LLM_PROVIDERS].sort()).toEqual(Object.keys(PROVIDER_PRESETS).sort())
  })
})

/** What GET reports for `setup`, as JSON: the raw text is checked for secrets */
async function settingsBody(setup: Setup): Promise<Record<string, unknown>> {
  const res = await getLLMSettings({ method: 'GET' } as ApiRequest, context(setup))
  return JSON.parse(JSON.stringify(res.body)) as Record<string, unknown>
}

interface ReportedProvider {
  provider: string
  ready: boolean
  active: boolean
  keySource: string | null
  env: string
  model: string | null
  baseUrl: string | null
}

function providerOf(body: Record<string, unknown>, name: string): ReportedProvider {
  const found = (body['providers'] as ReportedProvider[]).find((entry) => entry.provider === name)
  if (!found) throw new Error(`No ${name} in the report`)
  return found
}

describe('a provider is on when it has a key', () => {
  it('turns on a provider whose key is in the environment, and uses it, with nothing saved', async () => {
    const body = await settingsBody({
      provider: null,
      env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY },
    })
    expect(body).toMatchObject({ configured: true, provider: 'openai' })
    expect(providerOf(body, 'openai')).toMatchObject({
      ready: true,
      active: true,
      keySource: 'environment',
    })
    expect(providerOf(body, 'anthropic')).toMatchObject({
      ready: false,
      active: false,
      keySource: null,
    })
  })

  it('reports where each key comes from, and never a key', async () => {
    const res = await getLLMSettings(
      { method: 'GET' } as ApiRequest,
      context({
        provider: 'openai',
        env: { KRANTHO_LLM_GEMINI_API_KEY: ENV_KEY },
        code: { llm: { openrouter: { apiKey: 'sk-or-code' } } },
        stored: { openai: STORED_KEY },
      }),
    )
    const body = res.body as Record<string, unknown>
    expect(providerOf(body, 'openai')).toMatchObject({
      ready: true,
      active: true,
      keySource: 'saved',
    })
    expect(providerOf(body, 'gemini')).toMatchObject({
      ready: true,
      active: false,
      keySource: 'environment',
    })
    expect(providerOf(body, 'openrouter')).toMatchObject({
      ready: true,
      keySource: 'configuration',
    })
    const raw = JSON.stringify(res.body)
    for (const secret of [ENV_KEY, STORED_KEY, 'sk-or-code']) expect(raw).not.toContain(secret)
  })

  it('picks the first provider on when none was chosen, in a fixed order', async () => {
    const env = {
      KRANTHO_LLM_GEMINI_API_KEY: 'k-gemini',
      KRANTHO_LLM_OPENAI_API_KEY: 'k-openai',
      KRANTHO_LLM_ANTHROPIC_API_KEY: 'k-anthropic',
    }
    expect(await settingsBody({ provider: null, env })).toMatchObject({ provider: 'anthropic' })
    const { anthropic: _a, ...noAnthropic } = { anthropic: 0, ...env }
    void noAnthropic
    expect(
      await settingsBody({
        provider: null,
        env: { KRANTHO_LLM_GEMINI_API_KEY: 'k-gemini', KRANTHO_LLM_OPENAI_API_KEY: 'k-openai' },
      }),
    ).toMatchObject({ provider: 'openai' })
  })

  it('keeps the provider that was chosen, whichever others are on', async () => {
    const env = {
      KRANTHO_LLM_ANTHROPIC_API_KEY: 'k-anthropic',
      KRANTHO_LLM_GEMINI_API_KEY: 'k-gemini',
    }
    expect(await settingsBody({ provider: 'gemini', env })).toMatchObject({ provider: 'gemini' })
  })

  it('moves to a provider that is on when the chosen one has no key', async () => {
    const body = await settingsBody({
      provider: 'openai',
      env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY },
    })
    expect(body).toMatchObject({ provider: 'anthropic' })
    expect(providerOf(body, 'openai')).toMatchObject({ ready: false, active: false })
  })

  it('reports nothing on, and nothing in use, when no provider has a key', async () => {
    const body = await settingsBody({ provider: null })
    expect(body).toMatchObject({ configured: false, provider: null, model: null })
    for (const entry of body['providers'] as ReportedProvider[]) expect(entry.ready).toBe(false)
  })

  it('never lends a provider the key of another', async () => {
    const body = await settingsBody({
      provider: 'openai',
      env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY },
      stored: { anthropic: STORED_KEY },
    })
    expect(providerOf(body, 'openai')).toMatchObject({ ready: false, keySource: null })
  })

  it('gives no provider a key from the old variables', async () => {
    const body = await settingsBody({
      provider: null,
      env: { KRANTHO_LLM_API_KEY: ENV_KEY, CLAUDE_CODE_OAUTH_TOKEN: OAUTH },
    })
    for (const entry of body['providers'] as ReportedProvider[]) expect(entry.ready).toBe(false)
    const headers = await sentHeaders({ env: { KRANTHO_LLM_API_KEY: ENV_KEY } })
    expect(headers['x-api-key']).toBe('')
    expect(headers.authorization).toBeUndefined()
  })

  it('lists the subscription provider as on with its token, and never picks it for the site', async () => {
    const body = await settingsBody({
      provider: null,
      env: { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH },
    })
    expect(providerOf(body, 'claude-code')).toMatchObject({ ready: true, active: false })
    expect(body).toMatchObject({ configured: false, provider: null })
    const chosen = await settingsBody({
      provider: 'claude-code',
      env: { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: OAUTH },
    })
    expect(chosen).toMatchObject({
      configured: true,
      provider: 'claude-code',
      model: CLAUDE_CODE_MODEL,
    })
    expect(JSON.stringify(chosen)).not.toContain(OAUTH)
  })

  it('lists a local model as on only when it was chosen', async () => {
    expect(providerOf(await settingsBody({ provider: null }), 'ollama').ready).toBe(false)
    const body = await settingsBody({ provider: 'ollama' })
    expect(providerOf(body, 'ollama')).toMatchObject({ ready: true, active: true, keySource: null })
    expect(body).toMatchObject({ configured: true, provider: 'ollama' })
  })

  it("names the variable that sets each provider's key, for a developer", async () => {
    const body = await settingsBody({ provider: null })
    expect(providerOf(body, 'anthropic').env).toBe('KRANTHO_LLM_ANTHROPIC_API_KEY')
    expect(providerOf(body, 'openai').env).toBe('KRANTHO_LLM_OPENAI_API_KEY')
    expect(providerOf(body, 'gemini').env).toBe('KRANTHO_LLM_GEMINI_API_KEY')
    expect(providerOf(body, 'openrouter').env).toBe('KRANTHO_LLM_OPENROUTER_API_KEY')
    expect(providerOf(body, 'claude-code').env).toBe('KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN')
    expect(providerOf(body, 'ollama').env).toBe('')
  })

  it("reports the model in use: the one chosen for that provider, else the provider's default", async () => {
    const env = { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY }
    expect(await settingsBody({ provider: 'openai', env })).toMatchObject({ model: 'gpt-4o' })
    expect(
      await settingsBody({ provider: 'openai', env, storedModel: 'gpt-5-mini' }),
    ).toMatchObject({ model: 'gpt-5-mini' })
  })

  it('reports the provider assistant.provider gives the assistant, or null', async () => {
    expect(await settingsBody({})).toMatchObject({ assistantProvider: null })
    expect(await settingsBody({ code: { assistant: { provider: 'gemini' } } })).toMatchObject({
      assistantProvider: 'gemini',
    })
  })
})

/** What the vault opens for a provider's stored key */
async function opened(stored: Map<string, string>, provider: string): Promise<string | null> {
  const name = `llm.apiKey.${provider}`
  return fakeVault.open(name, stored.get(name) ?? '')
}

describe('PUT /api/settings/llm', () => {
  const put = (ctx: ApiContext, body: Record<string, unknown>) =>
    updateLLMSettings({ method: 'PUT', body } as ApiRequest, ctx)

  it('turns on the first provider that is given a key, and uses it', async () => {
    const { ctx, stored } = contextWithStore({ provider: null })
    const res = await put(ctx, { provider: 'openai', apiKey: 'sk-saved' })
    expect(res.body).toMatchObject({ configured: true, provider: 'openai' })
    expect(providerOf(res.body as Record<string, unknown>, 'openai')).toMatchObject({
      ready: true,
      active: true,
      keySource: 'saved',
    })
    expect(await opened(stored, 'openai')).toBe('sk-saved')
  })

  it('leaves what is in use in use when another provider is given a key', async () => {
    const { ctx, stored } = contextWithStore({
      provider: null,
      env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY },
    })
    const res = await put(ctx, { provider: 'anthropic', apiKey: 'sk-ant-saved' })
    const body = res.body as Record<string, unknown>
    expect(body).toMatchObject({ provider: 'openai' })
    expect(providerOf(body, 'anthropic')).toMatchObject({ ready: true, active: false })
    expect(stored.get('llm.provider')).toBe('openai')
  })

  it('uses the provider when it is asked to', async () => {
    const { ctx } = contextWithStore({
      provider: null,
      env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY },
    })
    const res = await put(ctx, { provider: 'anthropic', apiKey: 'sk-ant-saved', use: true })
    expect(res.body).toMatchObject({ provider: 'anthropic' })
  })

  it("saves a provider's model and base URL under that provider, and an empty value clears it", async () => {
    const { ctx, stored } = contextWithStore({
      provider: null,
      env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY },
    })
    await put(ctx, { provider: 'openai', model: 'gpt-5-mini', baseUrl: 'http://proxy.test' })
    expect(stored.get('llm.model.openai')).toBe('gpt-5-mini')
    expect(stored.get('llm.baseUrl.openai')).toBe('http://proxy.test')
    expect(stored.has('llm.model')).toBe(false)
    const cleared = await put(ctx, { provider: 'openai', model: '', baseUrl: '' })
    expect(providerOf(cleared.body as Record<string, unknown>, 'openai')).toMatchObject({
      model: null,
      baseUrl: null,
    })
  })

  it('keeps the stored key when a save names none, and replaces it when one is sent', async () => {
    const { ctx, stored } = contextWithStore({ provider: 'openai', storedKey: STORED_KEY })
    await put(ctx, { provider: 'openai', model: 'gpt-4o-mini' })
    expect(await opened(stored, 'openai')).toBe(STORED_KEY)
    await put(ctx, { provider: 'openai', apiKey: 'sk-replacement' })
    expect(await opened(stored, 'openai')).toBe('sk-replacement')
  })

  it('refuses to use a provider that has no key, and changes nothing about what is in use', async () => {
    const { ctx, stored } = contextWithStore({
      provider: 'anthropic',
      env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY },
    })
    const res = await put(ctx, { provider: 'openai', use: true })
    expect(res.status).toBe(400)
    expect(stored.get('llm.provider')).toBe('anthropic')
  })

  it('stores no key for claude-code or ollama', async () => {
    const { ctx, stored } = contextWithStore({ provider: null })
    await put(ctx, { provider: 'ollama', apiKey: 'ignored' })
    await put(ctx, { provider: 'claude-code', apiKey: 'ignored' })
    expect([...stored.keys()].filter((key) => key.startsWith('llm.apiKey'))).toEqual([])
  })

  it('turns on a local model when it is chosen, with its address', async () => {
    const { ctx } = contextWithStore({ provider: null })
    const res = await put(ctx, {
      provider: 'ollama',
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434',
      use: true,
    })
    expect(res.body).toMatchObject({ configured: true, provider: 'ollama' })
  })

  it('refuses a pasted key when the site has no vault, and saves nothing', async () => {
    const { ctx, stored } = contextWithStore({ provider: null, noVault: true })
    const res = await put(ctx, { provider: 'openai', apiKey: 'sk-secret-marker' })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toContain('KRANTHO_JWT_SECRET')
    expect(JSON.stringify(res.body)).not.toContain('sk-secret-marker')
    expect(stored.size).toBe(0)
  })

  it('still saves a model without a key when the site has no vault', async () => {
    const { ctx, stored } = contextWithStore({ provider: null, noVault: true })
    const res = await put(ctx, { provider: 'openai', model: 'gpt-4o-mini' })
    expect(res.status).toBe(200)
    expect(stored.get('llm.model.openai')).toBe('gpt-4o-mini')
  })

  it('rejects an unknown provider', async () => {
    const res = await put(context({}), { provider: 'mystery', apiKey: 'x' })
    expect(res.status).toBe(400)
  })

  it('is for admins only', async () => {
    const ctx = context({})
    const viewer = { ...ctx, auth: { ...ctx.auth, roles: ['viewer'] } } as ApiContext
    expect((await put(viewer, { provider: 'openai', apiKey: 'x' })).status).toBe(403)
  })
})

describe('DELETE /api/settings/llm', () => {
  const remove = (ctx: ApiContext, provider?: string) =>
    deleteLLMSettings(
      {
        method: 'DELETE',
        query: provider === undefined ? {} : { provider },
      } as unknown as ApiRequest,
      ctx,
    )

  it('removes what was saved for that provider and for no other', async () => {
    const { ctx, stored } = contextWithStore({
      provider: 'openai',
      stored: { openai: 'a', anthropic: 'b' },
      storedModel: 'gpt-5-mini',
    })
    const res = await remove(ctx, 'openai')
    expect(stored.get('llm.apiKey.openai')).toBe('')
    expect(stored.get('llm.model.openai')).toBe('')
    expect(await opened(stored, 'anthropic')).toBe('b')
    const body = res.body as Record<string, unknown>
    expect(providerOf(body, 'openai')).toMatchObject({ ready: false })
    expect(body).toMatchObject({ provider: 'anthropic' })
  })

  it('leaves a key from the environment, which is not stored here', async () => {
    const { ctx } = contextWithStore({
      provider: 'openai',
      storedKey: STORED_KEY,
      env: { KRANTHO_LLM_OPENAI_API_KEY: ENV_KEY },
    })
    const res = await remove(ctx, 'openai')
    expect(providerOf(res.body as Record<string, unknown>, 'openai')).toMatchObject({
      ready: true,
      keySource: 'environment',
    })
  })

  it('needs to be told which provider, and one it knows', async () => {
    expect((await remove(context({}))).status).toBe(400)
    expect((await remove(context({}), 'mystery')).status).toBe(400)
  })
})

/** Run a stream to its end: the request is what the tests inspect, the reply does not matter */
async function drain(events: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of events) {
    // consume
  }
}

describe('assistant.provider', () => {
  const env = {
    KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY,
    KRANTHO_LLM_OPENAI_API_KEY: OPENAI_ENV_KEY,
  }
  const stored = { storedModel: 'claude-sonnet-5', storedBaseUrl: 'http://proxy.test' }
  const chatRequest = {
    system: 's',
    messages: [{ role: 'user' as const, content: 'Hi' }],
    tools: [],
  }

  it("uses that provider with its own credential and model, not the one in use's", async () => {
    const ctx = context({ env, ...stored, code: { assistant: { provider: 'openai' } } })
    const { chat, credential } = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(chat.provider).toBe('openai')
    expect(chat.model).toBe('gpt-4o')
    expect(credential).toBe('api-key')
  })

  it('takes assistant.model over the provider default', async () => {
    const ctx = context({
      env,
      ...stored,
      code: { assistant: { provider: 'openai', model: 'gpt-4o-mini' } },
    })
    const { chat } = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(chat.model).toBe('gpt-4o-mini')
  })

  it("sends that provider's key to its own endpoint, not another provider's base URL", async () => {
    const ctx = context({ env, ...stored, code: { assistant: { provider: 'openai' } } })
    const { chat } = await resolveChatAdapter(ctx, ctx.config.assistant)
    await drain(chat.stream(chatRequest))
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${OPENAI_ENV_KEY}`)
  })

  it('follows the base URL chosen for that provider', async () => {
    const ctx = context({
      provider: 'openai',
      env,
      storedBaseUrl: 'http://proxy.test',
      code: { assistant: { provider: 'openai' } },
    })
    const { chat } = await resolveChatAdapter(ctx, ctx.config.assistant)
    await drain(chat.stream(chatRequest))
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://proxy.test/v1/chat/completions')
  })

  it('reports no credential when that provider has none, whatever enrichment uses', async () => {
    const ctx = context({
      env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY },
      code: { assistant: { provider: 'gemini' } },
    })
    const { chat, credential } = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(chat.provider).toBe('gemini')
    expect(credential).toBe('none')
  })

  it('works without a stored provider', async () => {
    const { ctx } = contextWithStore({
      provider: null,
      env,
      code: { assistant: { provider: 'openai' } },
    })
    const { chat } = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(chat.provider).toBe('openai')
  })

  it('leaves enrichment on the provider in use', async () => {
    const ctx = context({ env, ...stored, code: { assistant: { provider: 'openai' } } })
    const adapter = await resolveAdapter(ctx)
    await adapter.complete('Hi')
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://proxy.test/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(ENV_KEY)
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'claude-sonnet-5' })
  })

  it('keeps the provider and model in use when unset, with assistant.model replacing the model', async () => {
    const ctx = context({ env, storedModel: 'claude-sonnet-5' })
    const unset = await resolveChatAdapter(ctx, {})
    expect(unset.chat).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5' })
    const overridden = await resolveChatAdapter(ctx, { model: 'claude-opus-5' })
    expect(overridden.chat.model).toBe('claude-opus-5')
  })

  it('refuses claude-code in production and runs it on the token only', async () => {
    const code = { assistant: { provider: 'claude-code' as const } }
    const ctx = context({ env: both, code })
    const dev = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(dev).toMatchObject({ credential: 'oauth', chat: { provider: 'claude-code' } })

    vi.stubEnv('NODE_ENV', 'production')
    await expect(resolveChatAdapter(ctx, ctx.config.assistant)).rejects.toThrow(
      /development on your own machine/,
    )
  })

  it("runs the provider a user picked, with that provider's own model, over assistant.model", async () => {
    const ctx = context({
      env,
      ...stored,
      code: { assistant: { provider: 'anthropic', model: 'claude-opus-5' } },
    })
    const picked = await resolveChatAdapter(ctx, ctx.config.assistant, 'openai')
    expect(picked.chat).toMatchObject({ provider: 'openai', model: 'gpt-4o' })
    const unpicked = await resolveChatAdapter(ctx, ctx.config.assistant)
    expect(unpicked.chat).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5' })
  })

  it('refuses a provider a user picked that is not on', async () => {
    const ctx = context({ env: { KRANTHO_LLM_ANTHROPIC_API_KEY: ENV_KEY } })
    await expect(resolveChatAdapter(ctx, {}, 'openai')).rejects.toThrow(/not set up/)
    await expect(resolveChatAdapter(ctx, {}, 'mystery')).rejects.toThrow(/not set up/)
  })
})
