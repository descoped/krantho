import { accessCookieName, parseCookie, refreshCookieName, verifyJwt } from '@krantho/api'
import type { AuthSection, KranthoConfigInput } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'
import { isStudioBuildAsset, STUDIO_NOT_AVAILABLE_MESSAGE, serveStudioAsset } from './studio.js'

/** A request for a Studio path, reduced to what serving it needs */
export interface StudioRequest {
  url: URL
  cookie?: string | undefined
}

/** Serves /studio: the gate, then the SPA files, then the not-built notice */
export type StudioServer = (request: StudioRequest) => Response

/**
 * Create the /studio server shared by every framework adapter.
 *
 * Without configuration, or unless `auth.oidc.studioEntry` is `redirect`, it
 * serves the Studio SPA as-is and the SPA shows its own sign-in page. With
 * `redirect`, Studio is served only with a valid access token. Without one,
 * a browser that holds a refresh token is sent to `GET /api/auth/refresh`,
 * which issues a new token pair and returns it here — or, when the refresh
 * token is no longer valid, clears the session and starts a new sign-in. A
 * browser without either is sent to the OIDC sign-in, which returns it here.
 * Gated responses are private, so a shared cache never answers for the gate.
 * The build's hashed assets are served without the gate: they hold no data,
 * and the SPA fetches chunks lazily — after the access cookie expired, a gated
 * chunk would redirect and break the running Studio.
 */
export function createStudioServer(config?: KranthoConfigInput): StudioServer {
  let auth: AuthSection | undefined

  return (request) => {
    if (config) {
      auth ??= loadConfig({ code: config, env: process.env }).auth
      if (auth.mode === 'oidc' && auth.oidc.studioEntry === 'redirect') {
        return serveGated(request, auth)
      }
    }
    return serveStudioAsset(request.url.pathname) ?? studioNotAvailable()
  }
}

function serveGated(request: StudioRequest, auth: AuthSection): Response {
  if (isStudioBuildAsset(request.url.pathname)) {
    return serveStudioAsset(request.url.pathname) ?? studioNotAvailable()
  }
  const token = parseCookie(request.cookie, accessCookieName(auth.session))
  // Validation guarantees a JWT secret whenever studioEntry is redirect
  const hasSession =
    token !== undefined && auth.jwtSecret !== undefined && verifyJwt(token, auth.jwtSecret).valid

  if (hasSession) {
    const response = serveStudioAsset(request.url.pathname) ?? studioNotAvailable()
    return privateCopy(response)
  }

  const returnTo = encodeURIComponent(request.url.pathname + request.url.search)
  const canRefresh = Boolean(parseCookie(request.cookie, refreshCookieName(auth.session)))
  const location = canRefresh
    ? `/api/auth/refresh?returnTo=${returnTo}`
    : `/api/auth/login/oidc?returnTo=${returnTo}`
  return new Response(null, {
    status: 302,
    headers: { location, 'cache-control': 'no-store' },
  })
}

/** Same response, cacheable by the browser only */
function privateCopy(response: Response): Response {
  const headers = new Headers(response.headers)
  const cacheControl = headers.get('cache-control')
  let privateControl = 'private'
  if (cacheControl?.includes('public')) privateControl = cacheControl.replace('public', 'private')
  else if (cacheControl) privateControl = `private, ${cacheControl}`
  headers.set('cache-control', privateControl)
  return new Response(response.body, { status: response.status, headers })
}

function studioNotAvailable(): Response {
  return new Response(STUDIO_NOT_AVAILABLE_MESSAGE, {
    status: 503,
    headers: { 'content-type': 'text/plain' },
  })
}
