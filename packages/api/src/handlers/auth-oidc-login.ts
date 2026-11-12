import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
  getDiscovery,
} from '../oidc.js'
import { oidcStateCookie, sealOidcState } from '../oidc-state.js'
import { safeReturnTo } from '../return-to.js'
import type { ApiHandler } from '../types.js'

/** GET /api/auth/login/oidc — initiate OIDC PKCE flow, redirect to provider */
export const authOidcLogin: ApiHandler = async (req, ctx) => {
  const auth = ctx.config.auth

  if (auth.mode !== 'oidc') {
    return { status: 400, body: { error: 'OIDC mode is not enabled' } }
  }

  const { issuer, clientId, redirectUri, scopes } = auth.oidc
  const jwtSecret = auth.jwtSecret

  if (!issuer || !clientId || !redirectUri || !jwtSecret) {
    return {
      status: 500,
      body: {
        error: 'OIDC not configured. Set OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REDIRECT_URI.',
      },
    }
  }

  try {
    const discovery = await getDiscovery(issuer)

    const pending = {
      state: generateState(),
      codeVerifier: generateCodeVerifier(),
      nonce: generateNonce(),
      returnTo: safeReturnTo(req.query['returnTo']),
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      code_challenge: computeCodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      state: pending.state,
      nonce: pending.nonce,
    })

    // The pending sign-in rides in a sealed cookie so the callback can land on any instance
    return {
      status: 302,
      body: null,
      headers: { Location: `${discovery.authorization_endpoint}?${params.toString()}` },
      cookies: [oidcStateCookie(sealOidcState(pending, jwtSecret), auth, req.headers)],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OIDC discovery failed'
    return { status: 502, body: { error: message } }
  }
}
