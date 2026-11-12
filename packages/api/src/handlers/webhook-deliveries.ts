import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'

/** GET /api/webhooks/deliveries — list webhook delivery log */
export const webhookDeliveries: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.webhookDeliveryAdapter) {
    return { status: 200, body: { deliveries: [], total: 0 } }
  }

  const limit = req.query['limit'] ? Number.parseInt(req.query['limit'], 10) : 50
  const offset = req.query['offset'] ? Number.parseInt(req.query['offset'], 10) : 0
  const validStatuses = ['pending', 'delivered', 'failed'] as const
  const rawStatus = req.query['status']
  const status = validStatuses.includes(rawStatus as (typeof validStatuses)[number])
    ? (rawStatus as 'pending' | 'delivered' | 'failed')
    : undefined

  const result = await ctx.webhookDeliveryAdapter.listDeliveries({
    limit,
    offset,
    status,
  })

  return { status: 200, body: result }
}
