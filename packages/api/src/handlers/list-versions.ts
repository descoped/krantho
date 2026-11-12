import { hasVersioning } from '@krantho/persistence'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, requireParam, validateCollectionParam } from '../validators.js'

/** GET /api/content/:collection/:slug/versions — list version history */
export const listVersions: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value

  if (!hasVersioning(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support versioning' } }
  }

  const locale = parseLocaleParam(req.query['locale'])
  const versions = await ctx.adapter.listVersions(validated.collection, slug, locale)

  return { status: 200, body: { versions } }
}
