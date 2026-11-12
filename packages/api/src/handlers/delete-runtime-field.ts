import { hasRuntimeSchema } from '@krantho/persistence'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam } from '../validators.js'

/** DELETE /api/schema/:collection/fields/:field — remove a runtime field */
export const deleteRuntimeField: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  if (!hasRuntimeSchema(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support runtime schemas' } }
  }

  const fieldName = req.params['field']
  if (!fieldName) {
    return { status: 400, body: { error: 'Missing field name' } }
  }

  // Don't allow deleting code-defined fields
  const codeFieldNames = new Set(Object.keys(validated.collectionDef.schema.shape))
  if (codeFieldNames.has(fieldName)) {
    return {
      status: 409,
      body: { error: `Field "${fieldName}" is defined in code and cannot be deleted` },
    }
  }

  const existing = await ctx.adapter.getRuntimeSchema(validated.collection)
  if (!existing) {
    return { status: 404, body: { error: `Runtime field "${fieldName}" not found` } }
  }

  const filtered = existing.fields.filter((f) => f.name !== fieldName)
  if (filtered.length === existing.fields.length) {
    return { status: 404, body: { error: `Runtime field "${fieldName}" not found` } }
  }

  await ctx.adapter.saveRuntimeSchema(validated.collection, {
    collection: validated.collection,
    metadata: existing?.metadata ?? [],
    fields: filtered,
    updatedAt: new Date().toISOString(),
  })

  return { status: 200, body: { message: 'Field deleted', field: fieldName } }
}
