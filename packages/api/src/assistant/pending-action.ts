import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { canonicalJson } from '@krantho/core'
import { z } from 'zod'
import type { PendingActionKind } from './protocol.js'

/**
 * The state a proposal was computed against: the version plus the SHA-256 hex
 * of the canonical JSON `{ status, fields, body }` ('' for a new document)
 */
export type BaseState = z.infer<typeof baseStateSchema>

/** What confirming a proposal executes — exactly what the user was shown */
export type PendingAction = z.infer<typeof actionSchema>

export type VerifyResult =
  | { ok: true; action: PendingAction }
  | { ok: false; status: 400 | 403 | 410; error: string }

/** Separates these MACs from JWTs and preview tokens signed with the same secret */
const DOMAIN = 'krantho-assistant-action.v1.'
const BASE64URL = /^[A-Za-z0-9_-]+$/

const baseStateShape = {
  collection: z.string().min(1),
  slug: z.string().min(1),
  locale: z.string().min(1),
  baseVersion: z.int().nonnegative(),
  baseHash: z.string(),
}
const baseStateSchema = z.strictObject(baseStateShape)

const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('save_documents'),
    documents: z
      .array(
        z.strictObject({
          ...baseStateShape,
          fields: z.record(z.string(), z.unknown()),
          body: z.string(),
        }),
      )
      .min(1),
  }),
  z.strictObject({ kind: z.literal('publish'), documents: z.array(baseStateSchema).min(1) }),
  z.strictObject({ kind: z.literal('delete'), documents: z.array(baseStateSchema).min(1) }),
  z.strictObject({
    kind: z.literal('save_seo_properties'),
    baseVersion: z.number().int().positive(),
    locale: z.string().min(2),
    configId: z.string().min(1),
    schemaTypes: z.array(z.string().min(1)),
    add: z.record(z.string(), z.string()),
  }),
  z.strictObject({ kind: z.literal('save_llms_txt'), beforeHash: z.string(), text: z.string() }),
])

const payloadSchema = z.strictObject({
  v: z.literal(1),
  uid: z.string().min(1),
  exp: z.int().positive(),
  action: actionSchema,
})

/** SHA-256 hex of a string */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** The hash a proposal binds a document to; '' when there is no document */
export function stateHash(
  doc: { meta: { status: string }; fields: Record<string, unknown>; body: string } | null,
): string {
  if (!doc) return ''
  return sha256Hex(canonicalJson({ status: doc.meta.status, fields: doc.fields, body: doc.body }))
}

/** Studio's confirm roles: publishing and saving need an editor, the rest an admin */
export function roleForKind(kind: PendingActionKind): 'editor' | 'admin' {
  return kind === 'save_documents' || kind === 'publish' ? 'editor' : 'admin'
}

function mac(payloadPart: string, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAIN}${payloadPart}`).digest('base64url')
}

/** Sign an action for one user, valid for `ttlSec` seconds */
export function signPendingAction(
  action: PendingAction,
  userId: string,
  secret: string,
  ttlSec: number,
): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const payloadPart = Buffer.from(JSON.stringify({ v: 1, uid: userId, exp, action })).toString(
    'base64url',
  )
  return {
    token: `${payloadPart}.${mac(payloadPart, secret)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

const INVALID: VerifyResult = { ok: false, status: 400, error: 'Invalid action' }

/** The payload of a token whose MAC is valid, or null — never throws */
function authenticPayload(token: string, secret: string): unknown {
  const parts = token.split('.')
  const [payloadPart, macPart] = parts
  if (parts.length !== 2 || payloadPart === undefined || macPart === undefined) return null
  if (!BASE64URL.test(payloadPart) || !BASE64URL.test(macPart)) return null

  const expected = Buffer.from(mac(payloadPart, secret))
  const actual = Buffer.from(macPart)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const payload: unknown = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8'))
    return payload
  } catch {
    return null
  }
}

/** Check a token's signature, shape, expiry and user; a malformed token is rejected, never thrown on */
export function verifyPendingAction(token: string, userId: string, secret: string): VerifyResult {
  const payload = payloadSchema.safeParse(authenticPayload(token, secret))
  if (!payload.success) return INVALID
  if (payload.data.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 410, error: 'This proposal has expired; ask again' }
  }
  if (payload.data.uid !== userId) {
    return { ok: false, status: 403, error: 'This proposal was made for another user' }
  }
  return { ok: true, action: payload.data.action }
}
