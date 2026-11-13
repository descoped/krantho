import { documentPath, resolveSitePath } from '@krantho/core'
import { requireRole } from '../permissions.js'
import { PREVIEW_PARAM, signPreviewToken } from '../preview-token.js'
import type { ApiHandler, ApiResponse } from '../types.js'
import { requireParam, validateCollectionParam } from '../validators.js'

/** Any fixed origin: only the path of the redirect matters, and it must stay on it */
const SITE_ORIGIN = 'http://localhost'

/**
 * GET /api/preview?collection=&slug= — may this user preview the document on
 * the site, and at which path? Registered when the host renders drafts for
 * editors (`sitePreview`). In `draft-mode` it answers `{ path }` and the host
 * turns that into its own preview mode; in `signed-url` it sends the editor to
 * the page with a short-lived token bound to that path.
 */
export const sitePreview: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.query.collection, ctx)
  if (!validated.isValid) return validated.response
  const slugResult = requireParam(req.query, 'slug')
  if (!slugResult.isValid) return slugResult.response

  const path = documentPath(validated.collectionDef, slugResult.value)
  if (path === null) {
    return { status: 400, body: { error: `"${validated.collection}" has no pages to preview` } }
  }
  if (ctx.sitePreview !== 'signed-url') return { status: 200, body: { path } }
  return signedRedirect(path, ctx.config.auth.jwtSecret)
}

/**
 * Send the editor to the page with a token signed for its path. The path is
 * resolved as the browser will request it, and must stay on the site: a slug
 * that normalises to another host (`..//host`) gets no link and no token.
 */
function signedRedirect(path: string, secret: string | undefined): ApiResponse {
  // The API always resolves a signing secret (configured or ephemeral); never sign without one
  if (!secret) return { status: 500, body: { error: 'No signing secret for preview links' } }
  const target = resolveSitePath(path, SITE_ORIGIN)
  if (!target) return { status: 400, body: { error: 'The page path leaves the site' } }
  const token = signPreviewToken(target.pathname, secret)
  return {
    status: 307,
    body: null,
    headers: {
      location: `${target.pathname}?${new URLSearchParams({ [PREVIEW_PARAM]: token })}`,
      'cache-control': 'no-store',
    },
  }
}
