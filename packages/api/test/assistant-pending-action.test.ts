import { describe, expect, it, vi } from 'vitest'
import {
  type PendingAction,
  signPendingAction,
  verifyPendingAction,
} from '../src/assistant/pending-action.js'
import { signJwt } from '../src/jwt.js'
import { signPreviewToken } from '../src/preview-token.js'

const SECRET = 'secret-for-pending-actions-secret-for-pending-actions'
const action: PendingAction = {
  kind: 'publish',
  documents: [
    { collection: 'pages', slug: 'about', locale: 'en', baseVersion: 3, baseHash: 'abc' },
  ],
}

function sign(a: PendingAction = action, ttl = 600): string {
  return signPendingAction(a, 'user-1', SECRET, ttl).token
}

describe('pending action tokens', () => {
  it('round-trips an action for its user', () => {
    const { token, expiresAt } = signPendingAction(action, 'user-1', SECRET, 600)
    expect(verifyPendingAction(token, 'user-1', SECRET)).toEqual({ ok: true, action })
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())
  })

  it('rejects a tampered payload, a tampered MAC, another secret and malformed tokens with 400', () => {
    const token = sign()
    const [payload, mac] = token.split('.') as [string, string]
    const other = Buffer.from(
      JSON.stringify({
        v: 1,
        uid: 'user-1',
        exp: 9999999999,
        action: { ...action, kind: 'delete' },
      }),
    ).toString('base64url')
    const flipped = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`
    const invalid = { ok: false, status: 400, error: 'Invalid action' }

    for (const bad of [
      `${other}.${mac}`,
      `${payload}.${flipped}`,
      'garbage',
      '',
      'a.b.c',
      `${payload}.`,
    ]) {
      expect(verifyPendingAction(bad, 'user-1', SECRET)).toEqual(invalid)
    }
    expect(verifyPendingAction(token, 'user-1', 'another-secret')).toEqual(invalid)
  })

  it('rejects a JWT and a preview token signed with the same secret', () => {
    const jwt = signJwt({ sub: 'user-1', email: 'a@b.c', name: 'A', roles: ['admin'] }, SECRET)
    expect(verifyPendingAction(jwt, 'user-1', SECRET)).toMatchObject({ ok: false, status: 400 })
    expect(verifyPendingAction(signPreviewToken('/about', SECRET), 'user-1', SECRET)).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    )
  })

  it('rejects another user with 403 and an expired token with 410', () => {
    expect(verifyPendingAction(sign(), 'user-2', SECRET)).toMatchObject({ ok: false, status: 403 })
    vi.useFakeTimers()
    try {
      const token = sign(action, 60)
      vi.advanceTimersByTime(61_000)
      expect(verifyPendingAction(token, 'user-1', SECRET)).toMatchObject({ ok: false, status: 410 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a signed payload whose action kind is unknown', () => {
    const unknown = { kind: 'drop_tables', documents: [] } as unknown as PendingAction
    expect(verifyPendingAction(sign(unknown), 'user-1', SECRET)).toMatchObject({
      ok: false,
      status: 400,
    })
  })
})
