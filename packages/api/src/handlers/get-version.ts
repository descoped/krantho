import { hasVersioning } from '@krantho/persistence'
import type { ApiHandler } from '../types.js'
import {
  parseLocaleParam,
  parsePositiveInt,
  requireParam,
  validateCollectionParam,
} from '../validators.js'

/** GET /api/content/:collection/:slug/versions/:version — get specific version */
export const getVersion: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value

  const version = parsePositiveInt(req.params.version)
  if (version === undefined || version < 1) {
    return { status: 400, body: { error: 'Invalid version number' } }
  }

  if (!hasVersioning(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support versioning' } }
  }

  const locale = parseLocaleParam(req.query.locale)
  const doc = await ctx.adapter.getVersion(validated.collection, slug, version, locale)

  if (!doc) {
    return { status: 404, body: { error: `Version ${version} not found for "${slug}"` } }
  }

  return { status: 200, body: doc }
}
