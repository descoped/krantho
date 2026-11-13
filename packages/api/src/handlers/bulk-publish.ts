import { changePublication } from '../document-actions.js'
import { changedByFromAuth, requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam, validateRequestBody } from '../validators.js'

/**
 * POST /api/content/:collection/bulk-publish — publish the current version of
 * each slug in `slugs`, in `locale` (the site's default locale when absent).
 * Each document is published on its own; one that fails does not stop the rest.
 */
export const bulkPublish: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const bodyValidated = validateRequestBody(req.body)
  if (!bodyValidated.isValid) return bodyValidated.response

  const slugs = bodyValidated.body.slugs
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return { status: 400, body: { error: 'Request body must include a non-empty "slugs" array' } }
  }
  const requestedLocale = bodyValidated.body.locale
  const locale =
    typeof requestedLocale === 'string' ? requestedLocale : ctx.config.site.defaultLocale
  const changedBy = changedByFromAuth(ctx.auth)

  const results: Array<{ slug: string; published: boolean; error?: string }> = []
  for (const slug of slugs) {
    if (typeof slug !== 'string') continue
    const target = { collection: validated.collection, slug, locale }
    const response = await changePublication(ctx, target, 'publish', changedBy)
    if (response.status === 200) {
      results.push({ slug, published: true })
      continue
    }
    const error = (response.body as { error?: unknown } | undefined)?.error
    results.push({
      slug,
      published: false,
      error: typeof error === 'string' ? error : 'Publish failed',
    })
  }

  return {
    status: 200,
    body: { results, published: results.filter((r) => r.published).length },
  }
}
