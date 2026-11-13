import { canGetContent } from '@krantho/persistence'
import { getContentWithFallback } from '../locale-fallback.js'
import { resolveReferences } from '../reference-resolver.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

/** GET /api/content/:collection/:slug — single content item */
export const getContent: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value
  const locale = parseLocaleParam(req.query.locale)

  // Prefer adapter.getContent (returns ContentDocument) over engine.loadContent
  if (canGetContent(ctx.adapter)) {
    // Use locale fallback when a locale is requested
    const doc = locale
      ? await getContentWithFallback(
          ctx.adapter,
          validated.collection,
          slug,
          locale,
          ctx.config.site,
        )
      : await ctx.adapter.getContent(validated.collection, slug)
    if (!doc) {
      return {
        status: 404,
        body: { error: `Content "${slug}" not found in "${validated.collection}"` },
      }
    }

    // Resolve references if requested
    if (req.query.resolve === 'true') {
      const resolved = await resolveReferences(doc, ctx.adapter)
      return { status: 200, body: resolved }
    }

    return { status: 200, body: doc }
  }

  // Fallback to engine.loadContent for adapters without getContent.
  // Note: IContentEngine.loadContent does not accept a collection parameter,
  // so this fallback cannot scope the lookup to the validated collection.
  const result = await ctx.engine.loadContent(slug)
  if (result.error) {
    return {
      status: 404,
      body: { error: `Content "${slug}" not found in "${validated.collection}"` },
    }
  }

  const statusValue = result.fields.status

  return {
    status: 200,
    body: {
      meta: {
        collection: validated.collection,
        slug,
        locale: ctx.config.site.defaultLocale,
        version: 1,
        status: typeof statusValue === 'string' ? statusValue : 'draft',
        source: 'file',
        changedBy: null,
        createdAt: result.metadata.lastModified.toISOString(),
      },
      fields: result.fields,
      body: result.content,
      html: result.html,
      sections: result.sections,
    },
  }
}
