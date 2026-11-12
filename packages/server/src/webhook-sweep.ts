import type { WebhookConfig } from '@krantho/api'
import { processWebhookRetries } from '@krantho/api'
import type { IWebhookDeliveryAdapter } from '@krantho/persistence'

/** The least time between two sweeps for deliveries that are due again */
export const WEBHOOK_SWEEP_INTERVAL_MS = 30_000

export interface WebhookSweepOptions {
  webhooks: readonly WebhookConfig[]
  /** The delivery log the sweep reads the due deliveries from and records outcomes in */
  deliveries: IWebhookDeliveryAdapter
  /** Keeps the sweep running until it settles, on hosts that end a request's work with its response */
  waitUntil?: ((work: Promise<unknown>) => void) | undefined
  /** The clock, in milliseconds; tests replace it */
  now?: (() => number) | undefined
}

/**
 * Retry the deliveries that are due, without a timer: serverless hosts do not
 * keep one alive. The returned function is called for every request; it starts
 * a sweep when none is running and at least {@link WEBHOOK_SWEEP_INTERVAL_MS}
 * has passed since the last one started, and otherwise does nothing. A sweep
 * never blocks a request, and a failing one is logged, never thrown.
 */
export function createWebhookSweep(options: WebhookSweepOptions): () => void {
  const now = options.now ?? Date.now
  let lastStartedAt = Number.NEGATIVE_INFINITY
  let running = false

  return () => {
    const startedAt = now()
    if (running || startedAt - lastStartedAt < WEBHOOK_SWEEP_INTERVAL_MS) return
    lastStartedAt = startedAt
    running = true

    // Read the due deliveries after the request's own synchronous work, not before it
    const sweep = Promise.resolve()
      .then(() => processWebhookRetries(options.webhooks, options.deliveries))
      .catch((err: unknown) => {
        console.warn('[webhook] Retry sweep failed:', err)
      })
      .finally(() => {
        running = false
      })
    options.waitUntil?.(sweep)
  }
}
