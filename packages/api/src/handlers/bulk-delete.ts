import { canWriteContent } from '@krantho/persistence'
import { announceChanges } from '../content-change.js'
import { lockedByOther } from '../content-locks.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, validateCollectionParam, validateRequestBody } from '../validators.js'

/**
 * DELETE /api/content/:collection/bulk — delete each slug in `slugs`, in
 * `locale` (the site's default locale when absent); one someone else is
 * editing is left alone.
 */
export const bulkDelete: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const bodyValidated = validateRequestBody(req.body)
  if (!bodyValidated.isValid) return bodyValidated.response

  const slugs = bodyValidated.body['slugs']
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return { status: 400, body: { error: 'Request body must include a non-empty "slugs" array' } }
  }

  const requestedLocale = bodyValidated.body['locale']
  const locale =
    requestedLocale === undefined
      ? ctx.config.site.defaultLocale
      : parseLocaleParam(typeof requestedLocale === 'string' ? requestedLocale : undefined)
  if (locale === undefined) {
    return {
      status: 400,
      body: { error: '"locale" must be a locale code, such as "en" or "nb-NO"' },
    }
  }

  if (!canWriteContent(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support deleteContent' } }
  }

  const results: Array<{ slug: string; deleted: boolean; error?: string }> = []

  for (const slug of slugs) {
    if (typeof slug !== 'string') continue
    const locked = await lockedByOther(ctx, { collection: validated.collection, slug, locale })
    if (locked) {
      const error = (locked.body as { error: string }).error
      results.push({ slug, deleted: false, error })
      continue
    }
    try {
      await ctx.adapter.deleteContent(validated.collection, slug, locale)
      results.push({ slug, deleted: true })
    } catch (err: unknown) {
      console.warn(`[bulk-delete] Failed to delete ${slug}:`, err)
      results.push({
        slug,
        deleted: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      })
    }
  }

  await announceChanges(
    ctx,
    results
      .filter((r) => r.deleted)
      .map(
        (r) =>
          ({
            kind: 'document',
            collection: validated.collection,
            slug: r.slug,
            locale,
            live: true,
          }) as const,
      ),
  )

  return { status: 200, body: { results, deleted: results.filter((r) => r.deleted).length } }
}
