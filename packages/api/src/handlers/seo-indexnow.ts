import type { ApiHandler } from '../types.js'

/** The API path of the IndexNow key file; a site serves it at `/<key>.txt` */
export const SEO_INDEXNOW_KEY_PATH = '/api/seo/indexnow/:key'

/**
 * GET /api/seo/indexnow/:key — the IndexNow key file. IndexNow reads it at
 * `<site.baseUrl>/<key>.txt` to confirm the site owns the key, so the site
 * routes that address here. Answers the key as plain text when it matches
 * `seo.indexNow.key`, and 404 otherwise.
 */
export const seoIndexNowKey: ApiHandler = async (req, ctx) => {
  const key = ctx.config.seo.indexNow.key
  if (!key || req.params['key'] !== key) return { status: 404, body: { error: 'Not found' } }
  return { status: 200, body: key, headers: { 'content-type': 'text/plain; charset=utf-8' } }
}
