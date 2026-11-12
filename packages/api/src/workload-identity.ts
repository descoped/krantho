import type { AuthSection } from '@krantho/config'
import type { AuthResult } from './middleware/auth.js'
import { bearerToken } from './middleware/auth.js'
import { getDiscovery, verifySignedJwt } from './oidc.js'
import type { ApiRequest } from './types.js'

/**
 * Workload identity: a CI job presents the identity token its platform issues
 * (GitHub Actions, GitLab and others sign a JWT per job) as a Bearer token,
 * and the site verifies it against the one issuer the configuration trusts.
 * No secret is stored anywhere. The grant is narrow — an editor's read access on the
 * paths listed here, nothing else.
 */

/** The only paths a workload identity may read; every other path answers 403 */
export const WORKLOAD_PATHS: readonly string[] = ['/api/changes', '/api/migrations/conflicts']

/** The methods a workload identity may use */
const WORKLOAD_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD'])

/** How far a token's clocks may differ from this server's, in seconds */
const CLOCK_SKEW_SEC = 60

const INVALID_TOKEN = {
  isAuthenticated: false,
  response: { status: 401, body: { error: 'Invalid workload token' } },
} as const satisfies AuthResult

type WorkloadSection = AuthSection['workload']

interface ConfiguredWorkload {
  issuer: string
  audience: string
  subjects: string[]
}

/** The workload settings when the feature is on: issuer, audience and at least one subject */
function configuredWorkload(workload: WorkloadSection): ConfiguredWorkload | null {
  const { issuer, audience, subjects } = workload
  if (!issuer || !audience || subjects.length === 0) return null
  return { issuer, audience, subjects }
}

/**
 * The `iss` claim of a token, read without trusting it: the payload is decoded,
 * nothing is verified. It only decides which check the token goes through.
 */
function unverifiedIssuer(token: string): string | undefined {
  const parts = token.split('.')
  const payload = parts.length === 3 ? parts[1] : undefined
  if (!payload) return undefined
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (claims === null || typeof claims !== 'object') return undefined
    const { iss } = claims as { iss?: unknown }
    return typeof iss === 'string' ? iss : undefined
  } catch {
    return undefined
  }
}

function matchesSubject(subject: string, pattern: string): boolean {
  if (!pattern.endsWith('*')) return subject === pattern
  return subject.startsWith(pattern.slice(0, -1))
}

/** A NumericDate claim, which must be a finite number */
function timeClaim(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid time claim')
  }
  return value
}

/** exp is required and must lie ahead; nbf and iat, when present, must not lie ahead */
function checkTimes(claims: Record<string, unknown>): void {
  const now = Math.floor(Date.now() / 1000)
  if (timeClaim(claims['exp']) + CLOCK_SKEW_SEC <= now) throw new Error('Token expired')
  for (const name of ['nbf', 'iat']) {
    const value = claims[name]
    if (value !== undefined && timeClaim(value) - CLOCK_SKEW_SEC > now) {
      throw new Error(`Token ${name} lies in the future`)
    }
  }
}

/**
 * Verify a workload token against the configured issuer and return its subject.
 *
 * The issuer's key set is found through the discovery document of the
 * *configured* issuer, never through anything the token says. Throws on any
 * failure; the caller turns every throw into the same 401.
 */
async function verifyWorkloadToken(token: string, workload: ConfiguredWorkload): Promise<string> {
  const discovery = await getDiscovery(workload.issuer)
  if (discovery.issuer !== workload.issuer || typeof discovery.jwks_uri !== 'string') {
    throw new Error('Discovery document does not belong to the configured issuer')
  }

  const claims = await verifySignedJwt(token, discovery.jwks_uri)
  if (claims['iss'] !== workload.issuer) throw new Error('Issuer mismatch')

  const aud = claims['aud']
  const audiences = Array.isArray(aud) ? aud : [aud]
  if (!audiences.includes(workload.audience)) throw new Error('Audience mismatch')

  checkTimes(claims)

  const subject = claims['sub']
  if (typeof subject !== 'string' || subject === '') throw new Error('Missing subject')
  if (!workload.subjects.some((pattern) => matchesSubject(subject, pattern))) {
    throw new Error('Subject not allowed')
  }
  return subject
}

function allowedRead(req: ApiRequest): boolean {
  return WORKLOAD_METHODS.has(req.method.toUpperCase()) && WORKLOAD_PATHS.includes(req.path)
}

/**
 * Check a request that carries a workload identity token.
 *
 * Returns `null` when the request is not a workload request — the feature is
 * off, the site has no authentication, or the Bearer token names another
 * issuer — and the normal checks apply unchanged. A token that names the
 * workload issuer is verified strictly and never falls through: it is granted
 * an editor on {@link WORKLOAD_PATHS}, or refused.
 */
export async function checkWorkloadAuth(
  req: ApiRequest,
  auth: AuthSection,
): Promise<AuthResult | null> {
  const workload = configuredWorkload(auth.workload)
  if (!workload || auth.mode === 'none') return null

  const token = bearerToken(req)
  if (!token || unverifiedIssuer(token) !== workload.issuer) return null

  let subject: string
  try {
    subject = await verifyWorkloadToken(token, workload)
  } catch {
    return INVALID_TOKEN
  }

  if (!allowedRead(req)) {
    return {
      isAuthenticated: false,
      response: {
        status: 403,
        body: { error: `This token may only read ${WORKLOAD_PATHS.join(', ')}` },
      },
    }
  }

  return {
    isAuthenticated: true,
    user: {
      id: `workload:${subject}`,
      email: subject,
      name: 'CI workload',
      roles: ['editor'],
      mode: auth.mode,
    },
  }
}
