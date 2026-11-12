import type { AuthSection } from '@krantho/config'
import type { IAuthAdapter, Role, UserRecord } from '@krantho/persistence'
import { issueTokenPair } from '../auth-tokens.js'
import type { IdTokenClaims } from '../oidc.js'
import { exchangeCode, getDiscovery, verifyIdToken } from '../oidc.js'
import type { OidcPendingLogin } from '../oidc-state.js'
import { clearOidcStateCookie, oidcStateCookieName, openOidcState } from '../oidc-state.js'
import { assertRole } from '../permissions.js'
import type { ApiHandler, ApiRequest, ApiResponse } from '../types.js'
import { parseCookie } from '../validators.js'

/**
 * Identity extracted from the OIDC provider — email and name, plus the
 * immutable subject/issuer pair used to link a krantho user to an OIDC account.
 */
interface OidcIdentity {
  email: string
  name: string
  /** The provider's `email_verified` claim; undefined when it sends none */
  emailVerified: boolean | undefined
  oidcSubject: string
  oidcIssuer: string
}

/** Read an `email_verified` claim — a boolean, or the string some providers send */
function readEmailVerified(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

/**
 * Extract an identity from the verified ID token claims, falling back to the
 * userinfo endpoint (GET with the access token as Bearer) only when the ID
 * token carries no email — some providers (e.g. Zitadel) leave it out.
 * Returns null if no email can be obtained.
 */
async function extractIdentity(
  claims: IdTokenClaims,
  tokens: { access_token?: string | undefined; id_token: string },
  discovery: { userinfo_endpoint?: string | undefined },
): Promise<OidcIdentity | null> {
  let email = claims.email
  let name = claims.name
  let emailVerified = readEmailVerified(claims.email_verified)

  if (!email && tokens.access_token && discovery.userinfo_endpoint) {
    try {
      const userinfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfoRes.ok) {
        const userinfo = (await userinfoRes.json()) as Record<string, unknown>
        email = typeof userinfo['email'] === 'string' ? userinfo['email'] : undefined
        emailVerified = readEmailVerified(userinfo['email_verified'])
        if (!name) {
          name = typeof userinfo['name'] === 'string' ? userinfo['name'] : undefined
        }
      }
    } catch {
      // Userinfo fetch failed — fall through; caller will redirect with an error
    }
  }

  if (!email) return null
  return {
    email,
    name: name ?? email,
    emailVerified,
    oidcSubject: claims.sub,
    oidcIssuer: claims.iss,
  }
}

/** Whether an email appears in `auth.oidc.adminEmails` (case-insensitive) */
function isAdminEmail(email: string, configuredAdminEmails: readonly string[]): boolean {
  const adminEmails = configuredAdminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
}

/**
 * Resolve an OIDC identity to a krantho user, creating one when signup is open
 * — or, with signup closed, when the email is listed in `auth.oidc.adminEmails`
 * and the provider has not marked it unverified. That bootstrap lets the first
 * admin in on an empty user table. Returns `closed` when no user may be
 * created and `deactivated` for a deactivated match — the caller turns both
 * into user-facing errors.
 */
async function resolveOrCreateUser(
  identity: OidcIdentity,
  authAdapter: IAuthAdapter,
  oidc: AuthSection['oidc'],
): Promise<{ kind: 'ok'; user: UserRecord } | { kind: 'closed' } | { kind: 'deactivated' }> {
  // OIDC identity is the primary lookup; email is the secondary (for users
  // linking a new provider to an existing krantho account).
  let user = await authAdapter.getUserByOidc(identity.oidcIssuer, identity.oidcSubject)

  if (!user) {
    user = await authAdapter.getUserByEmail(identity.email)
    if (user) {
      await authAdapter.updateUser(user.id, {
        oidcSubject: identity.oidcSubject,
        oidcIssuer: identity.oidcIssuer,
      })
    }
  }

  if (!user) {
    const adminBootstrap =
      isAdminEmail(identity.email, oidc.adminEmails) && identity.emailVerified !== false
    if (oidc.signup === 'closed' && !adminBootstrap) return { kind: 'closed' }

    user = await authAdapter.createUser({
      email: identity.email,
      name: identity.name,
      roles: [assertRole(oidc.newUserRole, 'auth.oidc.newUserRole')],
      oidcSubject: identity.oidcSubject,
      oidcIssuer: identity.oidcIssuer,
    })
  }

  if (!user.isActive) return { kind: 'deactivated' }
  return { kind: 'ok', user }
}

/**
 * Promote the user to Studio if their email appears in `auth.oidc.adminEmails`.
 *
 * Returns the (possibly refreshed) user record, or null if the promotion
 * update happened but the re-fetch failed — that's a storage-layer bug the
 * caller treats as an error.
 */
async function maybePromoteToAdmin(
  user: UserRecord,
  email: string,
  authAdapter: IAuthAdapter,
  configuredAdminEmails: readonly string[],
): Promise<UserRecord | null> {
  if (!isAdminEmail(email, configuredAdminEmails) || user.roles.includes('admin')) {
    return user
  }

  await authAdapter.updateUser(user.id, { roles: ['admin'] as Role[] })
  return authAdapter.getUser(user.id)
}

/** A fully configured OIDC client, as the callback needs it */
interface OidcClient {
  auth: AuthSection
  issuerUrl: string
  clientId: string
  redirectUri: string
  jwtSecret: string
  authAdapter: IAuthAdapter
}

/**
 * Exchange the code, verify the ID token against the pending sign-in, and
 * provision the user. Returns the session cookies, or an error message for
 * the Studio login screen.
 */
async function completeSignIn(
  code: string,
  pending: OidcPendingLogin,
  client: OidcClient,
  headers: ApiRequest['headers'],
): Promise<{ cookies: string[] } | { error: string }> {
  const { auth, issuerUrl, clientId, authAdapter } = client
  const discovery = await getDiscovery(issuerUrl)
  const tokens = await exchangeCode(discovery.token_endpoint, {
    code,
    redirectUri: client.redirectUri,
    clientId,
    clientSecret: auth.oidc.clientSecret,
    codeVerifier: pending.codeVerifier,
  })
  const claims = await verifyIdToken(tokens.id_token, {
    issuerUrl,
    clientId,
    jwksUri: discovery.jwks_uri,
    nonce: pending.nonce,
  })

  const identity = await extractIdentity(claims, tokens, discovery)
  if (!identity) return { error: 'OIDC provider did not return email claim' }

  const resolved = await resolveOrCreateUser(identity, authAdapter, auth.oidc)
  if (resolved.kind === 'closed') return { error: 'User not authorized. Contact an administrator.' }
  if (resolved.kind === 'deactivated') {
    return { error: 'Account deactivated. Contact an administrator.' }
  }

  const promoted = await maybePromoteToAdmin(
    resolved.user,
    identity.email,
    authAdapter,
    auth.oidc.adminEmails,
  )
  if (!promoted) return { error: 'User not found after promotion' }

  const issued = await issueTokenPair({
    user: {
      id: promoted.id,
      email: promoted.email ?? identity.email,
      name: promoted.name ?? identity.name,
      roles: promoted.roles,
    },
    jwtSecret: client.jwtSecret,
    auth,
    headers,
    authAdapter,
  })
  return { cookies: issued.cookies }
}

/** GET /api/auth/callback — OIDC callback, exchange code, provision user, set cookies */
export const authCallback: ApiHandler = async (req, ctx) => {
  const auth = ctx.config.auth

  if (auth.mode !== 'oidc') {
    return { status: 400, body: { error: 'OIDC mode is not enabled' } }
  }

  const { issuer: issuerUrl, clientId, redirectUri } = auth.oidc
  const jwtSecret = auth.jwtSecret
  const authAdapter = ctx.authAdapter

  if (!issuerUrl || !clientId || !redirectUri || !jwtSecret || !authAdapter) {
    return { status: 500, body: { error: 'OIDC not fully configured' } }
  }

  // Errors land on the Studio login screen, or answer 404 when Studio is
  // gated; the pending sign-in is single-use, so every outcome clears its cookie
  const clearState = clearOidcStateCookie(auth, req.headers)
  const refuse = (message: string): ApiResponse => refuseSignIn(auth, message, clearState)

  const code = req.query['code']
  const state = req.query['state']
  const error = req.query['error']

  if (error) {
    const desc = req.query['error_description'] ?? error
    return refuse(`Authentication failed: ${desc}`)
  }
  if (!code || !state) {
    return refuse('Missing code or state parameter')
  }

  const sealed = parseCookie(req.headers?.['cookie'], oidcStateCookieName(auth.session))
  const pending = openOidcState(sealed, jwtSecret)
  if (!pending || pending.state !== state) {
    return refuse('Invalid or expired state parameter')
  }

  try {
    const client = { auth, issuerUrl, clientId, redirectUri, jwtSecret, authAdapter }
    const result = await completeSignIn(code, pending, client, req.headers)
    if ('error' in result) return refuse(result.error)

    return {
      status: 302,
      body: null,
      headers: { Location: pending.returnTo },
      cookies: [clearState, ...result.cookies],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OIDC authentication failed'
    return refuse(message)
  }
}

/**
 * Answer a sign-in that did not complete. With Studio gated
 * (`auth.oidc.studioEntry` is `redirect`) the answer is 404, so Studio's
 * existence is not revealed; the reason is logged for the operator. Otherwise
 * the Studio sign-in page shows the error.
 */
function refuseSignIn(auth: AuthSection, errorMessage: string, clearState: string): ApiResponse {
  if (auth.oidc.studioEntry === 'redirect') {
    console.warn(`[auth] Sign-in refused: ${errorMessage}`)
    return { status: 404, body: { error: 'Not found' }, cookies: [clearState] }
  }
  const url = `/studio/?error=${encodeURIComponent(errorMessage)}`
  return { status: 302, body: null, headers: { Location: url }, cookies: [clearState] }
}
