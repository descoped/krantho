import { hasRuntimeSchema } from '@krantho/persistence'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam } from '../validators.js'

/** GET /api/schema/:collection/runtime — runtime field extensions */
export const getRuntimeSchema: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  if (!hasRuntimeSchema(ctx.adapter)) {
    return { status: 200, body: { collection: validated.collection, fields: [] } }
  }

  const schema = await ctx.adapter.getRuntimeSchema(validated.collection)
  return {
    status: 200,
    body: schema ?? { collection: validated.collection, fields: [], updatedAt: null },
  }
}
