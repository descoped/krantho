import { createHmac } from 'node:crypto'
import type { WebhookEvent } from '@krantho/config'
import { type IWebhookDeliveryAdapter, MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import type { WebhookConfig } from './types.js'

interface WebhookPayload {
  event: WebhookEvent
  collection: string
  slug: string
  timestamp: string
}

/**
 * Retry delays in seconds, indexed by the attempts made: after a first attempt 30s, then 2min,
 * 15min and 1h (index 0 is never used: every delivery has made one attempt by the time it is
 * logged). The length equals MAX_WEBHOOK_ATTEMPTS from @krantho/persistence, which owns the limit.
 */
const RETRY_DELAYS = [0, 30, 120, 900, 3600]

/** When a delivery that has made `attempts` attempts, the last of them failing or still in flight, is due again */
function retryDueAt(attempts: number): Date {
  const retryIndex = Math.min(attempts, MAX_WEBHOOK_ATTEMPTS - 1)
  const delaySeconds = RETRY_DELAYS[retryIndex] ?? 3600
  return new Date(Date.now() + delaySeconds * 1000)
}

/** The sweep sends no more than this many deliveries at a time */
const SWEEP_BATCH = 20

/**
 * A send gives up after this long, well inside the first retry delay: a first
 * send is logged as due for retry only after that delay, so the retry sweep
 * never sends a delivery whose first send is still in flight.
 */
const SEND_TIMEOUT_MS = 10_000

/**
 * Fire webhooks for a content event.
 *
 * With a delivery adapter, deliveries are logged and failed deliveries are
 * retried with backoff. Without one, falls back to fire-and-forget.
 */
export function fireWebhooks(
  webhooks: readonly WebhookConfig[],
  event: WebhookEvent,
  collection: string,
  slug: string,
  deliveries?: IWebhookDeliveryAdapter,
): void {
  const payload: WebhookPayload = {
    event,
    collection,
    slug,
    timestamp: new Date().toISOString(),
  }

  const body = JSON.stringify(payload)

  for (const hook of webhooks) {
    if (!hook.events.includes(event)) continue
    deliverWebhook(hook, body, event, deliveries)
  }
}

/** Sign a payload with HMAC and deliver via fetch. Returns the Response or null on network error. */
function signAndDeliver(hook: WebhookConfig, body: string): Promise<Response | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (hook.secret) {
    const timestamp = Date.now().toString()
    const signature = createHmac('sha256', hook.secret).update(`${timestamp}.${body}`).digest('hex')
    headers['X-Webhook-Signature'] = `t=${timestamp},v1=${signature}`
  }

  return fetch(hook.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  }).catch(() => null)
}

/** Deliver a single webhook, logging the send when there is a delivery log */
function deliverWebhook(
  hook: WebhookConfig,
  body: string,
  event: string,
  deliveries?: IWebhookDeliveryAdapter,
): void {
  // Logged as due for a retry only after the first retry delay: until then the send is in flight
  const logged = deliveries
    ? deliveries.logDelivery({ url: hook.url, event, payload: body, retryAt: retryDueAt(1) })
    : null

  Promise.all([logged, signAndDeliver(hook, body)])
    .then(([deliveryId, res]) => {
      if (!res?.ok) {
        console.warn(`[webhook] ${event} to ${hook.url} failed with status ${res?.status ?? 0}`)
      }
      if (deliveries === undefined || deliveryId === null) return
      return res?.ok
        ? deliveries.markDelivered(deliveryId, res.status)
        : deliveries.markFailed(deliveryId, res?.status ?? 0, retryDueAt(1))
    })
    .catch((err: unknown) => {
      console.warn(`[webhook] ${event} to ${hook.url} could not be recorded:`, err)
    })
}

/** A stored delivery to send again: its row, its event, the payload it carried and the attempts made */
export interface Redelivery {
  id: number
  event: string
  payload: string
  attempts: number
}

/**
 * Send a stored delivery to its webhook once more, now, signed afresh with
 * the hook's secret; the row records how it went. Resolves when it has.
 */
export async function redeliverWebhook(
  hook: WebhookConfig,
  delivery: Redelivery,
  deliveries: IWebhookDeliveryAdapter,
): Promise<void> {
  const res = await signAndDeliver(hook, delivery.payload)
  if (res?.ok) {
    await deliveries.markDelivered(delivery.id, res.status)
    return
  }
  console.warn(`[webhook] Retry of ${delivery.event} to ${hook.url} failed: ${res?.status ?? 0}`)
  await deliveries.markFailed(delivery.id, res?.status ?? 0, retryDueAt(delivery.attempts))
}

/**
 * Send the deliveries that are due again: failed ones whose retry time has
 * passed, and any whose first send never recorded an outcome. Resolves when
 * every one has been sent and its outcome recorded.
 */
export async function processWebhookRetries(
  webhooks: readonly WebhookConfig[],
  deliveries: IWebhookDeliveryAdapter,
): Promise<void> {
  if (webhooks.length === 0) return

  // Only the configured hooks: a delivery to a hook removed since stays unsent
  // and must not take the places of the ones that can be sent. A claimed
  // delivery is held for the first retry delay, well beyond a send's timeout,
  // so no other sweep sends it meanwhile; its outcome then sets its next time
  const now = new Date()
  const pending = await deliveries.claimDueDeliveries({
    urls: webhooks.map((hook) => hook.url),
    now,
    leaseUntil: new Date(now.getTime() + (RETRY_DELAYS[1] ?? 30) * 1000),
    limit: SWEEP_BATCH,
  })

  const sends = pending.flatMap((delivery) => {
    const hook = webhooks.find((h) => h.url === delivery.url)
    if (!hook) return []
    return [
      redeliverWebhook(hook, delivery, deliveries).catch((err: unknown) => {
        console.warn(`[webhook] Retry of delivery ${delivery.id} could not be recorded:`, err)
      }),
    ]
  })
  await Promise.all(sends)
}
