import { canGetContent, type Publication } from '@krantho/persistence'
import { changePublication } from '../document-actions.js'
import { changedByFromAuth, requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

/** The publication a requested status asks for */
const PUBLICATION_OF: Readonly<Record<string, Publication>> = {
  published: 'publish',
  draft: 'unpublish',
  archived: 'archive',
}

/**
 * POST /api/content/:collection/:slug/publish — change what visitors see of one
 * document (`?locale=`, the site's default locale when absent). The body's
 * `status`: `published` makes the current version live, `draft` unpublishes,
 * `archived` archives; without one it toggles between published and draft.
 */
export const publishContent: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query.locale) ?? ctx.config.site.defaultLocale

  const body = req.body as Record<string, unknown> | undefined
  const requested = body?.status
  if (requested !== undefined && (typeof requested !== 'string' || !PUBLICATION_OF[requested])) {
    const valid = Object.keys(PUBLICATION_OF).join(', ')
    return { status: 400, body: { error: `Invalid status: ${String(requested)}. Valid: ${valid}` } }
  }

  let publication = typeof requested === 'string' ? PUBLICATION_OF[requested] : undefined
  if (!publication) {
    const current = canGetContent(ctx.adapter)
      ? await ctx.adapter.getContent(validated.collection, slug, locale)
      : null
    if (!current) return { status: 404, body: { error: `Content "${slug}" not found` } }
    publication = current.meta.status === 'published' ? 'unpublish' : 'publish'
  }

  const target = { collection: validated.collection, slug, locale }
  return changePublication(ctx, target, publication, changedByFromAuth(ctx.auth))
}
