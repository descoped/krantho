import { createHmac, timingSafeEqual } from 'node:crypto'

/** The query parameter that carries a signed preview token on a page URL */
export const PREVIEW_PARAM = 'krantho-preview'

/** How long a signed preview link stays valid, in seconds */
const PREVIEW_TOKEN_TTL_SEC = 600

const BASE64URL = /^[A-Za-z0-9_-]+$/
/** A positive integer, spelled one way only: no sign, no leading zeros */
const EXP = /^[1-9]\d*$/

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function mac(path: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${path}|${exp}`).digest('base64url')
}

/**
 * A preview token for one page path: base64url(`exp`) + `.` +
 * HMAC-SHA256(`secret`, `<path>|<exp>`), valid for ten minutes.
 */
export function signPreviewToken(path: string, secret: string): string {
  const exp = nowSec() + PREVIEW_TOKEN_TTL_SEC
  return `${Buffer.from(String(exp)).toString('base64url')}.${mac(path, exp, secret)}`
}

/**
 * Whether `token` was signed with `secret` for `path` and has not expired.
 * A malformed token is rejected, never thrown on.
 */
export function verifyPreviewToken(token: string, path: string, secret: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expPart, macPart] = parts as [string, string]
  if (!BASE64URL.test(expPart) || !BASE64URL.test(macPart)) return false

  const expText = Buffer.from(expPart, 'base64url').toString('utf-8')
  // Only the canonical encoding: no second spelling of the same token
  if (!EXP.test(expText) || Buffer.from(expText).toString('base64url') !== expPart) return false
  const exp = Number(expText)
  if (!Number.isSafeInteger(exp) || exp <= nowSec()) return false

  const expected = Buffer.from(mac(path, exp, secret))
  const actual = Buffer.from(macPart)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
