import { join } from 'node:path'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * A site running on Postgres end to end: the handler boots against an empty
 * database, migrates it, auto-imports the markdown fixture and serves content,
 * site settings, content locks, SEO config and users from Postgres alone.
 */

const FIXTURE_CONTENT = join(import.meta.dirname, 'fixtures', 'content')

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(FIXTURE_CONTENT, 'pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
})

let container: StartedPostgreSqlContainer
let handler: KranthoHandler
const savedEnv: Record<string, string | undefined> = {}

/** The environment must not steer the provider or the URL away from the container */
function clearKranthoEnv(): void {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return handler.handle(new Request(`http://localhost:4002${path}`, init))
}

beforeAll(async () => {
  clearKranthoEnv()
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('krantho_e2e')
    .withUsername('krantho')
    .withPassword('krantho')
    .start()
  handler = await createKranthoHandler({
    config: {
      site: {
        domain: 'localhost',
        name: 'Postgres Site',
        language: 'en',
        baseUrl: 'http://localhost:4002',
      },
      persistence: {
        provider: 'postgres',
        postgres: {
          url: container.getConnectionUri(),
          maxConnections: 2,
          prepare: false,
          idleTimeoutSec: 1,
        },
      },
      seo: { identity: 'Organization' },
    },
    collections: { pages },
  })
}, 120_000)

afterAll(async () => {
  handler?.close()
  restoreEnv()
  await container?.stop()
}, 60_000)

describe('krantho on Postgres', () => {
  it('serves the auto-imported collection', async () => {
    const res = await call('GET', '/api/content/pages')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ meta: { slug: string } }> }
    expect(body.items.map((doc) => doc.meta.slug).sort()).toEqual(['about', 'home'])
  })

  it('serves one document', async () => {
    const res = await call('GET', '/api/content/pages/home')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fields: { title: string } }
    expect(body.fields.title).toBe('Home')
  })

  it('stores site settings', async () => {
    const put = await call('PUT', '/api/settings/locales', { supportedLocales: ['en'] })
    expect(put.status).toBe(200)
    const res = await call('GET', '/api/settings/locales')
    expect(await res.json()).toEqual({
      defaultLocale: 'en',
      configuredLocales: ['en'],
      supportedLocales: ['en'],
      source: 'database',
    })
  })

  it('holds content locks', async () => {
    const acquired = await call('POST', '/api/content/pages/home/lock')
    expect(acquired.status).toBe(200)
    const res = await call('GET', '/api/content/pages/home/lock')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ locked: true })
  })

  it('seeds SEO config from the developer config', async () => {
    const res = await call('GET', '/api/seo/config?scope=site')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { configs: unknown[] }
    expect(JSON.stringify(body.configs)).toContain('Organization')
  })

  it('round-trips a user through the auth tables', async () => {
    const created = await call('POST', '/api/users', {
      email: 'editor@example.com',
      name: 'Editor',
      role: 'editor',
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    const res = await call('GET', `/api/users/${id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ email: 'editor@example.com', roles: ['editor'] })
  })
})

describe('webhooks on Postgres', () => {
  const HOOK_URL = 'https://hooks.example.test/krantho'
  let hooked: KranthoHandler
  let sent: string[]
  let work: Promise<unknown>[]
  let sql: Sql
  let dueId: number

  interface Delivery {
    id: number
    url: string
    status: number | null
    attempts: number
    deliveredAt: string | null
  }

  async function deliveries(): Promise<Delivery[]> {
    const res = await hooked.handle(new Request('http://localhost:4002/api/webhooks/deliveries'))
    return ((await res.json()) as { deliveries: Delivery[] }).deliveries
  }

  beforeAll(async () => {
    sent = []
    work = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body).slug)
        return new Response(null, { status: 200 })
      }),
    )
    hooked = await createKranthoHandler({
      config: {
        site: {
          domain: 'localhost',
          name: 'Postgres Site',
          language: 'en',
          baseUrl: 'http://localhost:4002',
        },
        persistence: {
          provider: 'postgres',
          postgres: {
            url: container.getConnectionUri(),
            maxConnections: 2,
            prepare: false,
            idleTimeoutSec: 1,
          },
        },
        webhooks: [{ url: HOOK_URL, events: ['publish'] }],
      },
      collections: { pages },
      waitUntil: (job) => {
        work.push(job)
      },
    })
    // Due before the first request, which starts the sweep at once
    sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} })
    const payload = JSON.stringify({ event: 'publish', collection: 'pages', slug: 'about' })
    const [row] = await sql<Array<{ id: number }>>`
      INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, next_retry_at)
      VALUES (${HOOK_URL}, 'publish', ${payload}::text::jsonb, 503, 1, '2020-01-01T00:00:00Z')
      RETURNING id`
    dueId = row?.id ?? 0
  }, 60_000)

  afterAll(async () => {
    hooked?.close()
    await sql?.end({ timeout: 5 })
    vi.unstubAllGlobals()
  })

  it('logs a delivery when a webhook fires', async () => {
    const res = await hooked.handle(
      new Request('http://localhost:4002/api/content/pages/home/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      }),
    )
    expect(res.status).toBeLessThan(300)

    await vi.waitFor(async () => {
      const logged = (await deliveries()).filter((delivery) => delivery.id !== dueId)
      expect(logged[0]?.deliveredAt).toBeTruthy()
    })
    expect(sent).toContain('home')
    const logged = (await deliveries()).filter((delivery) => delivery.id !== dueId)
    expect(logged).toMatchObject([{ url: HOOK_URL, status: 200, attempts: 1 }])
  })

  it('retries a failed delivery that is due, in the sweep the first request starts', async () => {
    await Promise.all(work)

    expect(sent).toContain('about')
    const retried = (await deliveries()).find((delivery) => delivery.id === dueId)
    expect(retried?.deliveredAt).toBeTruthy()
    expect(retried?.status).toBe(200)
  })
})
