import type { WebhookDelivery } from '../lib/api.js'

/**
 * Setup › Integrations: the webhook delivery log as `GET /api/webhooks/deliveries`
 * lists it, a page at a time, filtered by state.
 */

/** Attempts before a delivery counts as failed: `MAX_WEBHOOK_ATTEMPTS` of `@krantho/persistence` */
export const MAX_ATTEMPTS = 5

/** Deliveries per page */
export const PAGE_SIZE = 25

export type DeliveryState = 'pending' | 'delivered' | 'failed'

export type DeliveryFilter = 'all' | DeliveryState

export const FILTERS: readonly { id: DeliveryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'failed', label: 'Failed' },
]

/** A delivery's state, by the API's own rule: delivered, or failed once every attempt is used */
export function deliveryState(delivery: WebhookDelivery): DeliveryState {
  if (delivery.deliveredAt) return 'delivered'
  return delivery.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
}

/** The webhook's last answer: its HTTP status, a network error, or none yet */
export function httpLabel(status: number | null): string {
  if (status === null) return '—'
  return status === 0 ? 'Network error' : String(status)
}

/** What an empty page says, by its filter */
export function emptyText(filter: DeliveryFilter): string {
  switch (filter) {
    case 'pending':
      return 'No delivery is waiting for another attempt.'
    case 'delivered':
      return 'No delivery has reached its webhook yet.'
    case 'failed':
      return 'No delivery has failed.'
    default:
      return 'Nothing has been sent yet.'
  }
}

/** "Page 2 of 3", or null when one page holds them all */
export function pageText(page: number, total: number): string | null {
  const pages = Math.ceil(total / PAGE_SIZE)
  return pages > 1 ? `Page ${page + 1} of ${pages}` : null
}
