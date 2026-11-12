import { z } from 'zod'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireAssistantUser, requireJsonBody } from './access.js'
import { executeAction, preflightAction } from './execute-action.js'
import { roleForKind, verifyPendingAction } from './pending-action.js'

/**
 * POST /api/assistant/confirm `{ token }` — verify a proposal the user
 * confirmed (signature, expiry, user), re-authorize it for the user's current
 * role, check that nothing changed since it was made, then execute it. A plain
 * JSON request, so publishing and deleting run inside a request scope on every host.
 */
const confirmBody = z.object({ token: z.string().min(1) })

export const assistantConfirm: ApiHandler = async (req, ctx) => {
  const access = requireAssistantUser(ctx)
  if (!access.ok) return access.response
  const notJson = requireJsonBody(req)
  if (notJson) return notJson

  const body = confirmBody.safeParse(req.body)
  if (!body.success) return { status: 400, body: { error: 'Missing token' } }
  const { token } = body.data
  const secret = ctx.config.auth.jwtSecret
  if (!secret) return { status: 500, body: { error: 'No signing secret configured' } }

  const verified = verifyPendingAction(token, access.user.id, secret)
  if (!verified.ok) return { status: verified.status, body: { error: verified.error } }
  const denied = requireRole(access.user, roleForKind(verified.action.kind))
  if (denied) return denied

  const refused = await preflightAction(ctx, verified.action)
  if (refused) return refused

  const results = await executeAction(ctx, verified.action)
  return { status: 200, body: { ok: results.every((r) => r.status === 'done'), results } }
}
