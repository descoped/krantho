import { createHmac } from 'node:crypto'
import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import {
  openDatabase,
  runMigrations,
  SqliteWebhookDeliveryAdapter,
  sqliteMigrations,
} from '@krantho/persistence-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandlers } from '../src/create-api-handlers.js'
import { webhookRetry } from '../src/handlers/webhook-retry.js'
import type { ApiContext, ApiResponse, WebhookConfig } from '../src/types.js'
import { processWebhookRetries } from '../src/webhooks.js'
import { editor } from './assistant/auth.js'
import { contentConfig, testConfig, testEngine, testStores } from './assistant/fixtures.js'

const HOOK: WebhookConfig = {
  url: 'https://hooks.example.test/publish',
  events: ['publish'],
  secret: 'hook-secret',
}

const PAYLOAD = JSON.stringify({ event: 'publish', collection: 'pages', slug: 'home' })

let db: ReturnType<typeof openDatabase>
let deliveries: SqliteWebhookDeliveryAdapter
/** The background attempts a retry starts, awaited by the tests */
let attempts: Promise<unknown>[]

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, sqliteMigrations)
  deliveries = new SqliteWebhookDeliveryAdapter(db)
  attempts = []
})

afterEach(() => {
  db.close()
  vi.unstubAllGlobals()
})

/** A delivery row as the delivery log leaves it: failed, pending or delivered */
function seed(state: 'failed' | 'pending' | 'delivered', url = HOOK.url): number {
  const attemptsMade = state === 'failed' ? MAX_WEBHOOK_ATTEMPTS : 2
  const row = db
    .prepare(
      `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts, delivered_at)
       VALUES (?, 'publish', ?, ?, ?, ?) RETURNING id`,
    )
    .get(url, PAYLOAD, state === 'delivered' ? 200 : 503, attemptsMade, null) as { id: number }
  if (state === 'delivered') {
    db.prepare("UPDATE webhook_deliveries SET delivered_at = datetime('now') WHERE id = ?").run(
      row.id,
    )
  }
  return row.id
}

function api(webhooks: readonly WebhookConfig[] = [HOOK]): ReturnType<typeof createApiHandlers> {
  return createApiHandlers({
    contentConfig,
    config: testConfig({ auth: { mode: 'none' } }),
    adapter: testStores().adapter,
    engine: testEngine(),
    webhooks,
    webhookDeliveryAdapter: deliveries,
    waitUntil: (work) => {
      attempts.push(work)
    },
  })
}

function retry(id: number | string, handlers = api()): Promise<ApiResponse> {
  return handlers.handle({
    method: 'POST',
    path: `/api/webhooks/deliveries/${id}/retry`,
    params: {},
    query: {},
  })
}

/** Answer every webhook POST with the status, recording what was sent */
function hookAnswers(status: number): Array<{ url: string; init: RequestInit }> {
  const sent: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return new Response(null, { status })
  })
  return sent
}

describe('POST /api/webhooks/deliveries/:id/retry', () => {
  it('re-queues a failed delivery with one attempt left and answers 202 with it pending', async () => {
    hookAnswers(200)
    const id = seed('failed')
    const response = await retry(id)
    expect(response.status).toBe(202)
    const { delivery } = response.body as { delivery: Record<string, unknown> }
    expect(delivery).toMatchObject({ id, url: HOOK.url, attempts: MAX_WEBHOOK_ATTEMPTS - 1 })
    expect(delivery['deliveredAt']).toBeNull()
  })

  it('sends the stored payload to the configured webhook again, signed with its secret', async () => {
    const sent = hookAnswers(200)
    await retry(seed('failed'))
    await Promise.all(attempts)
    expect(sent).toHaveLength(1)
    const [call] = sent
    expect(call?.url).toBe(HOOK.url)
    expect(call?.init.body).toBe(PAYLOAD)
    const headers = call?.init.headers as Record<string, string> | undefined
    const signature = headers?.['X-Webhook-Signature'] ?? ''
    const [stamp, mac] = signature.split(',')
    const timestamp = stamp?.replace('t=', '') ?? ''
    const expected = createHmac('sha256', 'hook-secret').update(`${timestamp}.${PAYLOAD}`)
    expect(mac).toBe(`v1=${expected.digest('hex')}`)
  })

  it('keeps the periodic retry sweep from sending it a second time while it is sent', async () => {
    const sent: string[] = []
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', (url: string) => {
      sent.push(url)
      return new Promise<Response>((resolve) => {
        answer = resolve
      })
    })
    const id = seed('failed')
    await retry(id)
    processWebhookRetries([HOOK], deliveries)
    answer(new Response(null, { status: 200 }))
    await Promise.all(attempts)
    expect(sent).toEqual([HOOK.url])
    expect((await deliveries.getDelivery(id))?.deliveredAt).not.toBeNull()
  })

  it('records the delivery as delivered when the webhook accepts it', async () => {
    hookAnswers(204)
    const id = seed('failed')
    await retry(id)
    await Promise.all(attempts)
    const stored = await deliveries.getDelivery(id)
    expect(stored?.deliveredAt).not.toBeNull()
    expect(stored?.status).toBe(204)
    const { total } = await deliveries.listDeliveries({ limit: 10, offset: 0, status: 'delivered' })
    expect(total).toBe(1)
  })

  it('records it as failed again when the webhook refuses it once more', async () => {
    hookAnswers(500)
    const id = seed('failed')
    await retry(id)
    await Promise.all(attempts)
    const stored = await deliveries.getDelivery(id)
    expect(stored).toMatchObject({ deliveredAt: null, status: 500, attempts: MAX_WEBHOOK_ATTEMPTS })
    const { total } = await deliveries.listDeliveries({ limit: 10, offset: 0, status: 'failed' })
    expect(total).toBe(1)
  })

  it('refuses a delivery that has not failed: delivered, or still pending', async () => {
    const sent = hookAnswers(200)
    for (const state of ['delivered', 'pending'] as const) {
      const response = await retry(seed(state))
      expect(response.status).toBe(409)
      expect(response.body).toEqual({ error: 'Only a failed delivery can be retried' })
    }
    expect(sent).toHaveLength(0)
  })

  it('refuses a delivery whose webhook is no longer configured, leaving it failed', async () => {
    const sent = hookAnswers(200)
    const id = seed('failed', 'https://gone.example.test/hook')
    const response = await retry(id)
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'No configured webhook has this URL any more' })
    expect((await deliveries.getDelivery(id))?.attempts).toBe(MAX_WEBHOOK_ATTEMPTS)
    expect(sent).toHaveLength(0)
  })

  it('answers 404 for an unknown id and 400 for one that is not a whole number', async () => {
    expect((await retry(999)).status).toBe(404)
    expect((await retry('abc')).status).toBe(400)
    expect((await retry(0)).status).toBe(400)
  })

  it('answers 404 when the site logs no deliveries', async () => {
    const response = await createApiHandlers({
      contentConfig,
      config: testConfig({ auth: { mode: 'none' } }),
      adapter: testStores().adapter,
      engine: testEngine(),
    }).handle({ method: 'POST', path: '/api/webhooks/deliveries/1/retry', params: {}, query: {} })
    expect(response.status).toBe(404)
  })

  it('is for admins only', async () => {
    const id = seed('failed')
    const ctx = {
      auth: editor,
      webhookDeliveryAdapter: deliveries,
      webhooks: [HOOK],
    } as unknown as ApiContext
    const response = await webhookRetry(
      { method: 'POST', path: '', params: { id: String(id) }, query: {} },
      ctx,
    )
    expect(response.status).toBe(403)
  })

  it('fails loudly on a delivery log that is not SQLite', async () => {
    const postgresLike = {
      listDeliveries: async () => ({ deliveries: [], total: 0 }),
      getDelivery: async () => {
        throw new Error('Webhook delivery supports SQLite persistence only.')
      },
      requeueDelivery: async () => null,
    }
    const ctx = {
      auth: { id: 'a', email: 'a@example.test', name: 'A', roles: ['admin'], mode: 'none' },
      webhookDeliveryAdapter: postgresLike,
      lockDb: {},
      webhooks: [HOOK],
    } as unknown as ApiContext
    await expect(
      webhookRetry({ method: 'POST', path: '', params: { id: '1' }, query: {} }, ctx),
    ).rejects.toThrow(/SQLite persistence only/)
  })
})
