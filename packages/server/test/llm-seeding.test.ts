import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Boot seeds the stored LLM settings only when the app's code passed an `llm`
 * block, or the environment chose a provider and supplied that provider's own
 * key. Any other `llm.*` variable alone, a lone key or the subscription token
 * included, must not seed a provider. The subscription token itself is never stored.
 */

const site = {
  domain: 'localhost',
  name: 'Seeding',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const pages = defineCollection({
  name: 'pages',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

let dataDir: string
const savedEnv: Record<string, string | undefined> = {}

/** Variables krantho no longer reads: set by the tests that prove it, restored after */
const OLD_VARIABLES = ['KRANTHO_LLM_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']

beforeEach(() => {
  for (const name of OLD_VARIABLES) {
    savedEnv[name] = process.env[name]
    delete process.env[name]
  }
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = mkdtempSync(join(tmpdir(), 'krantho-llm-seed-'))
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dataDir, { recursive: true, force: true })
})

interface ReportedProvider {
  provider: string
  ready: boolean
  active: boolean
  keySource: string | null
  model: string | null
  baseUrl: string | null
}

interface LlmSettingsBody {
  configured: boolean
  /** The provider in use, or null when none is on */
  provider: string | null
  providers: ReportedProvider[]
}

/** What the settings report for one provider */
function providerIn(settings: LlmSettingsBody, name: string): ReportedProvider {
  const found = settings.providers.find((entry) => entry.provider === name)
  if (!found) throw new Error(`No ${name} in the report`)
  return found
}

async function storedLlmSettings(config: KranthoConfigInput = {}): Promise<LlmSettingsBody> {
  const body = await rawLlmSettings(config)
  return JSON.parse(body) as LlmSettingsBody
}

async function rawLlmSettings(config: KranthoConfigInput = {}): Promise<string> {
  const handler = await createKranthoHandler({
    config: { site, paths: { dataDir }, ...config },
    collections: { pages },
  })
  try {
    const res = await handler.handle(new Request('http://localhost:4002/api/settings/llm'))
    return await res.text()
  } finally {
    handler.close()
  }
}

/** Every byte krantho wrote under the data directory, as one string */
function dataDirContents(): string {
  return readdirSync(dataDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name)).toString('latin1'))
    .join('\n')
}

describe('LLM settings seeding', () => {
  it('does not seed from KRANTHO_LLM_MODEL alone', async () => {
    process.env['KRANTHO_LLM_MODEL'] = 'claude-haiku-4-5'
    const settings = await storedLlmSettings()
    expect(settings.provider).toBeNull()
    expect(settings.configured).toBe(false)
    expect(providerIn(settings, 'anthropic').model).toBeNull()
  })

  it('turns on a provider from a lone key, without seeding anything', async () => {
    process.env['KRANTHO_LLM_ANTHROPIC_API_KEY'] = 'sk-seed-test'
    const settings = await storedLlmSettings()
    expect(settings.provider).toBe('anthropic')
    expect(providerIn(settings, 'anthropic')).toMatchObject({
      ready: true,
      active: true,
      keySource: 'environment',
    })
  })

  it('keeps the provider the environment chose when only another provider has a key', async () => {
    process.env['KRANTHO_LLM_PROVIDER'] = 'openai'
    process.env['KRANTHO_LLM_ANTHROPIC_API_KEY'] = 'sk-seed-test'
    const settings = await storedLlmSettings()
    expect(providerIn(settings, 'openai').ready).toBe(false)
    expect(settings.provider).toBe('anthropic')
  })

  it('seeds the chosen provider, and uses its key from the environment without storing it', async () => {
    process.env['KRANTHO_LLM_PROVIDER'] = 'openai'
    process.env['KRANTHO_LLM_OPENAI_API_KEY'] = 'sk-env-marker-never-stored'
    const settings = await storedLlmSettings()
    expect(settings.provider).toBe('openai')
    expect(providerIn(settings, 'openai')).toMatchObject({ ready: true, keySource: 'environment' })
    expect(dataDirContents()).not.toContain('sk-env-marker-never-stored')
  })

  it('does not pick the subscription provider for the site from its token alone', async () => {
    process.env['KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN'] = 'oat-seed-test-token-marker'
    const settings = await storedLlmSettings()
    expect(settings.provider).toBeNull()
    expect(settings.configured).toBe(false)
    expect(providerIn(settings, 'claude-code')).toMatchObject({ ready: true, active: false })
  })

  it('runs claude-code on the token when the code names the provider, and never stores it', async () => {
    const token = 'oat-seed-test-token-marker'
    process.env['KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN'] = token
    const body = await rawLlmSettings({ llm: { provider: 'claude-code' } })
    const settings = JSON.parse(body) as LlmSettingsBody

    expect(settings.provider).toBe('claude-code')
    expect(providerIn(settings, 'claude-code')).toMatchObject({
      ready: true,
      keySource: 'environment',
    })
    expect(body).not.toContain(token)
    expect(dataDirContents()).not.toContain(token)
  })

  it('reads the credential per boot, not from the first seed', async () => {
    process.env['KRANTHO_LLM_PROVIDER'] = 'openai'
    process.env['KRANTHO_LLM_OPENAI_API_KEY'] = 'sk-seed-test'
    const keyOnly = await storedLlmSettings()
    expect(providerIn(keyOnly, 'openai')).toMatchObject({ ready: true, keySource: 'environment' })

    delete process.env['KRANTHO_LLM_OPENAI_API_KEY']
    const removed = await storedLlmSettings()
    expect(providerIn(removed, 'openai').ready).toBe(false)
    expect(removed.configured).toBe(false)
  })

  it('seeds when the code passes an llm block', async () => {
    const settings = await storedLlmSettings({ llm: { provider: 'openai', model: 'gpt-5-mini' } })
    expect(providerIn(settings, 'openai')).toMatchObject({ model: 'gpt-5-mini', ready: false })
  })

  it('uses a key the code passes for its own provider, and never stores the key', async () => {
    const config = { llm: { openai: { apiKey: 'sk-code-openai-marker' } } }
    const keyOnly = await storedLlmSettings(config)
    expect(keyOnly.provider).toBe('openai')
    expect(providerIn(keyOnly, 'openai').keySource).toBe('configuration')

    const chosen = await storedLlmSettings({ llm: { ...config.llm, provider: 'openai' } })
    expect(chosen.provider).toBe('openai')
    expect(dataDirContents()).not.toContain('sk-code-openai-marker')

    const other = await storedLlmSettings({ llm: { ...config.llm, provider: 'anthropic' } })
    expect(other.provider).toBe('openai')
  })

  it('does not read the old variables: the key, or the harness token', async () => {
    process.env['KRANTHO_LLM_API_KEY'] = 'sk-old-marker'
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'oat-harness-marker'

    const key = await rawLlmSettings({ llm: { provider: 'anthropic' } })
    expect(providerIn(JSON.parse(key) as LlmSettingsBody, 'anthropic').ready).toBe(false)
    expect(key).not.toContain('sk-old-marker')

    const token = await rawLlmSettings({ llm: { provider: 'claude-code' } })
    expect(providerIn(JSON.parse(token) as LlmSettingsBody, 'claude-code').ready).toBe(false)

    expect(dataDirContents()).not.toContain('sk-old-marker')
    expect(dataDirContents()).not.toContain('oat-harness-marker')
  })
})
