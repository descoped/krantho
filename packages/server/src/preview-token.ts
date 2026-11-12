import { PREVIEW_PARAM, resolveJwtSecret, verifyPreviewToken } from '@krantho/api'
import type { KranthoConfig } from '@krantho/config'

/**
 * Whether a page request carries a valid signed preview token
 * (`?krantho-preview=`, from `GET /api/preview` in `signed-url` mode): signed
 * for this URL's path and not expired, with the secret the API signs with —
 * `auth.jwtSecret`, or the process's ephemeral secret when none is configured.
 */
export function verifyPreviewRequest(url: URL, config: Pick<KranthoConfig, 'auth'>): boolean {
  const token = url.searchParams.get(PREVIEW_PARAM)
  if (!token) return false
  return verifyPreviewToken(token, url.pathname, resolveJwtSecret(config.auth))
}
