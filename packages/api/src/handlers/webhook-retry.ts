import {
  type IWebhookDeliveryAdapter,
  MAX_WEBHOOK_ATTEMPTS,
  type StoredWebhookDelivery,
} from '@krantho/persistence'
import { requireRole } from '../permissions.js'
import type { ApiContext, ApiHandler, ApiResponse, WebhookConfig } from '../types.js'
import { requireParam } from '../validators.js'
import { redeliverWebhook } from '../webhooks.js'

function refuse(status: number, error: string): ApiResponse {
  return { status, body: { error } }
}

/** The delivery id from the path: a positive whole number */
function deliveryId(params: Record<string, string> | undefined): number | ApiResponse {
  const result = requireParam(params, 'id')
  if (!result.isValid) return result.response
  const id = Number(result.value)
  return Number.isInteger(id) && id > 0 ? id : refuse(400, 'Invalid delivery id')
}

/**
 * How long a retried delivery stays out of the periodic retry sweep: the
 * immediate send records its outcome long before, so the sweep sends it
 * only when that send never recorded one (the process stopped mid-send),
 * and never a second time alongside it
 */
const RETRY_HOLD_MS = 60 * 60 * 1000

function isFailed(delivery: StoredWebhookDelivery): boolean {
  return delivery.deliveredAt === null && delivery.attempts >= MAX_WEBHOOK_ATTEMPTS
}

/** A failed delivery and the configured webhook it is sent to again */
interface Retry {
  delivery: StoredWebhookDelivery
  hook: WebhookConfig
}

/** What a retry sends where, or why the delivery cannot be retried */
function retryOf(delivery: StoredWebhookDelivery | null, ctx: ApiContext): Retry | ApiResponse {
  if (!delivery) return refuse(404, 'No webhook delivery has this id')
  if (!isFailed(delivery)) return refuse(409, 'Only a failed delivery can be retried')
  const hook = ctx.webhooks?.find((candidate) => candidate.url === delivery.url)
  return hook ? { delivery, hook } : refuse(409, 'No configured webhook has this URL any more')
}

/** Send it again in the background; the delivery's row records how it went */
function sendAgain(
  ctx: ApiContext,
  deliveries: IWebhookDeliveryAdapter,
  { delivery, hook }: Retry,
): void {
  const attempt = redeliverWebhook(hook, delivery, deliveries).catch((err: unknown) => {
    console.warn(`[webhook] Retry of delivery ${delivery.id} could not be recorded:`, err)
  })
  ctx.waitUntil?.(attempt)
}

/**
 * POST /api/webhooks/deliveries/:id/retry — put a failed delivery back in the
 * queue with one attempt left, held back from the periodic sweep, and send it
 * again at once, signed afresh, to
 * the configured webhook with its URL. Answers 202 with the delivery as
 * re-queued (pending); the attempt's outcome is recorded on the delivery:
 * delivered, or failed again.
 */
export const webhookRetry: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const id = deliveryId(req.params)
  if (typeof id !== 'number') return id
  const deliveries = ctx.webhookDeliveryAdapter
  if (!deliveries) return refuse(404, 'Webhook deliveries are not logged')

  const retry = retryOf(await deliveries.getDelivery(id), ctx)
  if ('status' in retry) return retry

  const delivery = await deliveries.requeueDelivery(id, new Date(Date.now() + RETRY_HOLD_MS))
  if (!delivery) return refuse(409, 'Only a failed delivery can be retried')
  sendAgain(ctx, deliveries, retry)
  return { status: 202, body: { delivery } }
}
