import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envNameFor, LEAVES } from '@krantho/config'
import { openDatabase } from '@krantho/persistence-sqlite'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/** A site configures outgoing webhooks in its krantho configuration; deliveries are logged and retried */

const HOOK_URL = 'https://hooks.example.test/krantho'

const site = {
  domain: 'localhost',
  name: 'Webhooks',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

interface Delivery {
  webhookUrl?: string
  url?: string
  event: string
  status: number | null
  deliveredAt: string | null
}

let dataDir: string
let handler: KranthoHandler
let sent: Array<{ url: string; body: string; signature: string | null }>
let work: Promise<unknown>[]
const savedEnv: Record<string, string | undefined> = {}

async function start(secret?: string): Promise<void> {
  handler = await createKranthoHandler({
    config: {
      site,
      paths: { dataDir },
      webhooks: [{ url: HOOK_URL, events: ['create'], ...(secret ? { secret } : {}) }],
    },
    collections: { blog },
    waitUntil: (job) => {
      work.push(job)
    },
  })
}

function call(method: string, path: string, body?: unknown): Promise<Response> {
  return handler.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

async function deliveries(): Promise<Delivery[]> {
  const response = await call('GET', '/api/webhooks/deliveries')
  return ((await response.json()) as { deliveries: Delivery[] }).deliveries
}

beforeEach(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-webhooks-')), 'data')
  sent = []
  work = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
      sent.push({ url, body: init.body, signature: init.headers['X-Webhook-Signature'] ?? null })
      return new Response(null, { status: 200 })
    }),
  )
})

afterEach(() => {
  handler?.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('webhooks from the configuration', () => {
  it('fires a configured webhook on a content create and logs the delivery', async () => {
    await start('hook-secret')

    const created = await call('POST', '/api/content/blog', {
      slug: 'hello',
      fields: { title: 'Hello' },
      body: 'Hi',
    })
    expect(created.status).toBeLessThan(300)

    await vi.waitFor(async () => expect((await deliveries())[0]?.deliveredAt).toBeTruthy())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe(HOOK_URL)
    expect(JSON.parse(sent[0]?.body ?? '{}')).toMatchObject({
      event: 'create',
      collection: 'blog',
      slug: 'hello',
    })
    expect(sent[0]?.signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(await deliveries()).toHaveLength(1)
  })

  it('does not fire an event the webhook is not subscribed to', async () => {
    await start()
    await call('POST', '/api/content/blog', { slug: 'a', fields: { title: 'A' }, body: '' })
    await call('POST', '/api/content/blog/a/publish', { status: 'published' })

    await vi.waitFor(async () => expect(await deliveries()).toHaveLength(1))
    expect(sent.map((hook) => JSON.parse(hook.body).event)).toEqual(['create'])
  })

  it('reports webhooks and the delivery log in the capabilities', async () => {
    await start()
    const capabilities = (await (await call('GET', '/api/capabilities')).json()) as {
      features: Record<string, string>
    }
    expect(capabilities.features['webhooks']).toBe('enabled')
    expect(capabilities.features['webhookDeliveries']).toBe('enabled')
  })

  it('reports no webhooks when none are configured', async () => {
    handler = await createKranthoHandler({
      config: { site, paths: { dataDir } },
      collections: { blog },
    })
    const capabilities = (await (await call('GET', '/api/capabilities')).json()) as {
      features: Record<string, string>
    }
    expect(capabilities.features['webhooks']).toBe('disabled')
  })

  it('retries a failed delivery that is due, from the next request', async () => {
    await start()
    const db = openDatabase(join(dataDir, 'content.db'))
    const row = db
      .prepare(
        `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, next_retry_at)
         VALUES (?, 'create', ?, 503, 1, ?) RETURNING id`,
      )
      .get(
        HOOK_URL,
        JSON.stringify({ event: 'create', collection: 'blog', slug: 'old' }),
        '2020-01-01T00:00:00.000Z',
      ) as {
      id: number
    }

    await call('GET', '/api/collections')
    await Promise.all(work)

    expect(sent.map((hook) => JSON.parse(hook.body).slug)).toEqual(['old'])
    const stored = db
      .prepare('SELECT delivered_at FROM webhook_deliveries WHERE id = ?')
      .get(row.id) as { delivered_at: string | null }
    expect(stored.delivered_at).not.toBeNull()
    db.close()
  })
})
