import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineCollection } from '@krantho/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Auth reaches the handler from the environment alone, with no `auth` block in
 * code — the variable names deployments already set keep working.
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

let handler: KranthoHandler
let dataDir: string
const saved: Record<string, string | undefined> = {}

function setEnv(key: string, value: string): void {
  saved[key] = process.env[key]
  process.env[key] = value
}

beforeAll(async () => {
  setEnv('KRANTHO_AUTH', 'token')
  setEnv('KRANTHO_API_TOKEN', 'shared-secret')
  setEnv('KRANTHO_JWT_SECRET', 'jwt-secret-for-the-test')

  dataDir = mkdtempSync(join(tmpdir(), 'krantho-env-auth-'))
  handler = await createKranthoHandler({
    config: {
      site: {
        domain: 'localhost',
        name: 'Test',
        language: 'en',
        baseUrl: 'http://localhost:4002',
      },
      paths: { dataDir },
    },
    collections: { pages },
  })
})

afterAll(() => {
  handler.close()
  rmSync(dataDir, { recursive: true, force: true })
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function login(token: string): Promise<Response> {
  return handler.handle(
    new Request('http://localhost:4002/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  )
}

describe('auth configured from the environment only', () => {
  it('reports token mode', async () => {
    const res = await handler.handle(new Request('http://localhost:4002/api/capabilities'))
    const body = (await res.json()) as { authMode: string }
    expect(body.authMode).toBe('token')
  })

  it('accepts the shared secret and issues a session', async () => {
    const res = await login('shared-secret')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { mode: string; identity: string }
    expect(body.mode).toBe('token')
    expect(body.identity).toBe('admin@local')
    expect(res.headers.get('set-cookie')).toContain('krantho_access=')
  })

  it('rejects the wrong secret', async () => {
    const res = await login('not-the-secret')
    expect(res.status).toBe(401)
  })

  it('requires auth for writes', async () => {
    const res = await handler.handle(
      new Request('http://localhost:4002/api/content/pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'new', fields: { title: 'x', description: 'y' } }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
