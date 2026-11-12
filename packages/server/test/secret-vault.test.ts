import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import { resolveConfig } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createKranthoHandler } from '../src/handler.js'
import { createLocalSecretVault, createSecretVault } from '../src/secret-vault.js'

const KEY = 'a-key-of-at-least-thirty-two-characters'
const OTHER_KEY = 'another-key-of-at-least-thirty-two-chars'

const site = {
  domain: 'localhost',
  name: 'Vault',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

describe('the local secret vault', () => {
  it('opens what it sealed, under the same name', async () => {
    const vault = createLocalSecretVault(KEY)
    const sealed = await vault.seal('llm.apiKey.openai', 'sk-secret')
    expect(await vault.open('llm.apiKey.openai', sealed)).toBe('sk-secret')
  })

  it('seals the same value differently each time, and never as the plain text', async () => {
    const vault = createLocalSecretVault(KEY)
    const first = await vault.seal('llm.apiKey.openai', 'sk-secret')
    const second = await vault.seal('llm.apiKey.openai', 'sk-secret')
    expect(first).not.toBe(second)
    expect(first).not.toContain('sk-secret')
  })

  it('does not open a value sealed under another name', async () => {
    const vault = createLocalSecretVault(KEY)
    const sealed = await vault.seal('llm.apiKey.openai', 'sk-secret')
    expect(await vault.open('llm.apiKey.anthropic', sealed)).toBeNull()
  })

  it('does not open a value sealed with another key', async () => {
    const sealed = await createLocalSecretVault(KEY).seal('llm.apiKey.openai', 'sk-secret')
    expect(await createLocalSecretVault(OTHER_KEY).open('llm.apiKey.openai', sealed)).toBeNull()
  })

  it('does not open a tampered value, plain text, or nothing', async () => {
    const vault = createLocalSecretVault(KEY)
    const sealed = await vault.seal('llm.apiKey.openai', 'sk-secret')
    // A character in the middle carries six bits of the value; the last one may hold padding bits
    // only, and a change there can decode to the same bytes
    const middle = Math.floor(sealed.length / 2)
    const tampered = `${sealed.slice(0, middle)}${sealed[middle] === 'A' ? 'B' : 'A'}${sealed.slice(middle + 1)}`
    expect(await vault.open('llm.apiKey.openai', tampered)).toBeNull()
    expect(await vault.open('llm.apiKey.openai', 'sk-plain-text-key')).toBeNull()
    expect(await vault.open('llm.apiKey.openai', '')).toBeNull()
  })
})

describe('createSecretVault', () => {
  const vaultFor = (config: KranthoConfigInput, env: Record<string, string> = {}) =>
    createSecretVault(resolveConfig({ site, ...config }, env))

  it('is the local vault keyed by secrets.local.key', async () => {
    const vault = await vaultFor({ secrets: { local: { key: KEY } } })
    expect(vault?.label).toBe('Local key')
    const sealed = await createLocalSecretVault(KEY).seal('n', 'v')
    expect(await vault?.open('n', sealed)).toBe('v')
  })

  it('falls back to the signing secret, and prefers secrets.local.key', async () => {
    const sealed = await createLocalSecretVault(OTHER_KEY).seal('n', 'v')
    const fallback = await vaultFor({ auth: { jwtSecret: OTHER_KEY } })
    expect(await fallback?.open('n', sealed)).toBe('v')

    const preferred = await vaultFor({
      auth: { jwtSecret: OTHER_KEY },
      secrets: { local: { key: KEY } },
    })
    expect(await preferred?.open('n', sealed)).toBeNull()
  })

  it('reads the key from the environment', async () => {
    const vault = await vaultFor({}, { KRANTHO_SECRETS_LOCAL_KEY: KEY })
    expect(vault).toBeDefined()
  })

  it('is none when there is no key to work with', async () => {
    expect(await vaultFor({})).toBeUndefined()
  })

  it('is none when the signing secret it would fall back to is too short', async () => {
    expect(await vaultFor({ auth: { jwtSecret: 'too-short' } })).toBeUndefined()
  })
})

const pages = defineCollection({
  name: 'pages',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'krantho-vault-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function dataDirContents(): string {
  return readdirSync(dataDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name)).toString('latin1'))
    .join('\n')
}

async function withSite<T>(
  config: KranthoConfigInput,
  run: (call: (method: string, body?: unknown) => Promise<Response>) => Promise<T>,
): Promise<T> {
  const handler = await createKranthoHandler({
    config: { site, paths: { dataDir }, ...config },
    collections: { pages },
  })
  try {
    return await run((method, body) =>
      handler.handle(
        new Request('http://localhost:4002/api/settings/llm', {
          method,
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),
    )
  } finally {
    handler.close()
  }
}

/** What the settings report for openai */
function openaiOf(body: unknown): unknown {
  const { providers } = body as { providers: { provider: string }[] }
  return providers.find((entry) => entry.provider === 'openai')
}

describe('a key pasted in Studio', () => {
  const SECRET = 'sk-pasted-marker-never-in-the-database'

  it('is stored sealed, opens for the same deployment, and not for another key', async () => {
    const keyed = { auth: { jwtSecret: KEY } }
    await withSite(keyed, async (call) => {
      const saved = await call('PUT', { provider: 'openai', apiKey: SECRET })
      expect(saved.status).toBe(200)
      expect(await saved.text()).not.toContain(SECRET)
    })
    expect(dataDirContents()).not.toContain(SECRET)

    const same = await withSite(keyed, async (call) => (await call('GET')).json())
    expect(same).toMatchObject({ configured: true, provider: 'openai' })
    expect(openaiOf(same)).toMatchObject({ ready: true, keySource: 'saved' })

    const rotated = await withSite({ auth: { jwtSecret: OTHER_KEY } }, async (call) =>
      (await call('GET')).json(),
    )
    expect(rotated).toMatchObject({ configured: false, provider: null })
    expect(openaiOf(rotated)).toMatchObject({ ready: false, keySource: null })
  })

  it('is refused when the deployment has no key to seal it with', async () => {
    await withSite({}, async (call) => {
      const res = await call('PUT', { provider: 'openai', apiKey: SECRET })
      expect(res.status).toBe(400)
      expect(await res.text()).not.toContain(SECRET)
    })
    expect(dataDirContents()).not.toContain(SECRET)
  })
})
