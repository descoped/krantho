import { documentPath } from '@krantho/core'
import { canGetContent } from '@krantho/persistence'
import { composePageJsonLd } from '../seo-compose.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

/**
 * GET /api/seo/preview/:collection/:slug — compose the JSON-LD of the
 * document's current version in its collection and locale (`?locale=`, the
 * site's default when absent; 400 when it is not a locale code)
 */
export const seoPreview: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const collection = validated.collection
  const requestedLocale = req.query.locale
  const locale = parseLocaleParam(requestedLocale)
  if (requestedLocale !== undefined && locale === undefined) {
    return {
      status: 400,
      body: { error: '"locale" must be a locale code, such as "en" or "nb-NO"' },
    }
  }
  if (!canGetContent(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support reading a document' } }
  }

  const current = await ctx.adapter.getContent(collection, slug, locale)
  if (!current) {
    return {
      status: 404,
      body: { error: `Content "${slug}" not found in "${collection}"` },
    }
  }

  const graph = await composePageJsonLd({
    collection,
    slug,
    path: documentPath(validated.collectionDef, slug),
    fields: current.fields,
    metadata: current.metadata,
    documentMeta: current.meta,
    config: ctx.config,
    seoConfigs: ctx.seoConfigAdapter,
  })
  return { status: 200, body: graph }
}
