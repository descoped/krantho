import { documentPath, invalidationsFor } from '@krantho/core'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

/**
 * GET /api/content/:collection/:slug/publish-impact — what publishing the
 * document would refresh (editor), before it happens: its page, the
 * collection's lists, for a global every page that reads it, and — when the
 * site's instances share their page cache in the database — how many cached
 * entries (pages and data) carry the change. Without a shared cache krantho
 * does not know which pages are cached, so it gives no count.
 */
export const publishImpact: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response
  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query['locale']) ?? ctx.config.site.defaultLocale

  const collection = validated.collection
  const path = documentPath(validated.collectionDef, slug)
  const tags = invalidationsFor({ kind: 'document', collection, slug, locale, live: true }).flatMap(
    (invalidation) => invalidation.tags,
  )
  const caching = ctx.config.cache.pages
  const cachedEntries =
    caching !== 'none' && ctx.pageCacheStore ? await ctx.pageCacheStore.countTagged(tags) : null

  return {
    status: 200,
    body: {
      collection,
      slug,
      locale,
      paths: path === null ? [] : [path],
      lists: [collection],
      everyPageReading: path === null,
      caching,
      tags,
      cachedEntries,
    },
  }
}
