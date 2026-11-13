import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyJwt } from '@krantho/api'
import { defineCollection } from '@krantho/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Auth settings come from the configuration tree. The signing secret resolves
 * env → code → ephemeral; before the tree the server overwrote it from the
 * environment unconditionally, so a `jwtSecret` set in code was dead. A
 * configured role is checked at boot instead of minting a token that every
 * permission check then rejects.
 */

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(import.meta.dirname, 'fixtures', 'content', 'pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
})

const cleanup: Array<() => void> = []

afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
})

interface BootOptions {
  jwtSecret?: string
  role?: string
  env?: Record<string, string>
}

async function boot(options: BootOptions = {}): Promise<KranthoHandler> {
  const dataDir = mkdtempSync(join(tmpdir(), 'krantho-auth-'))
  const saved: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(options.env ?? {})) {
    saved[key] = process.env[key]
    process.env[key] = value
  }
  cleanup.push(() => {
    rmSync(dataDir, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const handler = await createKranthoHandler({
    config: {
      site: { domain: 'localhost', name: 'Test', language: 'en', baseUrl: 'http://localhost:4002' },
      paths: { dataDir },
      auth: {
        mode: 'token',
        token: { secret: 'shared-secret', ...(options.role ? { role: options.role } : {}) },
        ...(options.jwtSecret ? { jwtSecret: options.jwtSecret } : {}),
      },
    },
    collections: { pages },
  })
  cleanup.push(() => handler.close())
  return handler
}

async function accessToken(handler: KranthoHandler): Promise<string> {
  const res = await handler.handle(
    new Request('http://localhost:4002/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'shared-secret' }),
    }),
  )
  expect(res.status).toBe(200)
  const match = /krantho_access=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')
  expect(match).not.toBeNull()
  return match![1]!
}

describe('jwt secret precedence', () => {
  it('honours a jwtSecret set in code when no environment variable is set', async () => {
    delete process.env.KRANTHO_JWT_SECRET
    const handler = await boot({ jwtSecret: 'secret-from-code' })

    const token = await accessToken(handler)
    expect(verifyJwt(token, 'secret-from-code').valid).toBe(true)
  })

  it('lets the environment variable beat the code value', async () => {
    const handler = await boot({
      jwtSecret: 'secret-from-code',
      env: { KRANTHO_JWT_SECRET: 'secret-from-env' },
    })

    const token = await accessToken(handler)
    expect(verifyJwt(token, 'secret-from-env').valid).toBe(true)
    expect(verifyJwt(token, 'secret-from-code').valid).toBe(false)
  })
})

describe('token role', () => {
  it('fails the boot when the configured role is not a role', async () => {
    delete process.env.KRANTHO_TOKEN_ROLE
    await expect(boot({ jwtSecret: 'x', role: 'superuser' })).rejects.toThrow(/auth\.token\.role/)
  })
})
