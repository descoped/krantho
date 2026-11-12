import { hasRuntimeSchema, type RuntimeFieldDefinition } from '@krantho/persistence'
import { assertAuthorProperty } from '@krantho/schema'
import { requireRole } from '../permissions.js'
import { isTextList, runtimeFieldError } from '../runtime-field-checks.js'
import type { ApiHandler } from '../types.js'
import { isOneOf, validateCollectionParam, validateRequestBody } from '../validators.js'

const VALID_FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'url',
  'email',
  'textarea',
  'color',
  'reference',
] as const

/** PUT /api/schema/:collection/fields — add or update a runtime field */
export const saveRuntimeField: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  if (!hasRuntimeSchema(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support runtime schemas' } }
  }

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const body = bodyCheck.body
  const fieldName = body['name']
  const fieldType = body['type']

  if (!fieldName || typeof fieldName !== 'string') {
    return { status: 400, body: { error: 'Field "name" is required' } }
  }

  try {
    assertAuthorProperty(fieldName)
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : 'Invalid field name' },
    }
  }

  if (!fieldType || typeof fieldType !== 'string' || !isOneOf(VALID_FIELD_TYPES, fieldType)) {
    return {
      status: 400,
      body: { error: `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}` },
    }
  }

  // Don't allow overriding code-defined fields
  const codeFieldNames = new Set(Object.keys(validated.collectionDef.schema.shape))
  if (codeFieldNames.has(fieldName)) {
    return {
      status: 409,
      body: { error: `Field "${fieldName}" is defined in code and cannot be overridden` },
    }
  }

  const enumValues = body['enumValues']
  if (enumValues !== undefined && !isTextList(enumValues)) {
    return { status: 400, body: { error: 'An enum’s values are a list of text.' } }
  }

  // Get existing runtime schema
  const existing = await ctx.adapter.getRuntimeSchema(validated.collection)
  const fields = existing?.fields ?? []

  // Build validated field definition from body
  const idx = fields.findIndex((f) => f.name === fieldName)
  const normalized: RuntimeFieldDefinition = {
    name: fieldName,
    type: fieldType as RuntimeFieldDefinition['type'],
    required: body['required'] === true,
    default: body['default'],
    description: typeof body['description'] === 'string' ? body['description'] : undefined,
    enumValues: isTextList(enumValues) ? enumValues : undefined,
    isArray: body['isArray'] === true,
    refCollection: typeof body['refCollection'] === 'string' ? body['refCollection'] : undefined,
    min: typeof body['min'] === 'number' ? body['min'] : undefined,
    max: typeof body['max'] === 'number' ? body['max'] : undefined,
    pattern: typeof body['pattern'] === 'string' ? body['pattern'] : undefined,
  }

  const invalid = runtimeFieldError(normalized, new Set(ctx.contentConfig.collections.keys()))
  if (invalid) return { status: 400, body: { error: invalid } }
  // Documents already hold values of the field's type: changing it is not additive
  const before = fields[idx]
  if (before && before.type !== normalized.type) {
    return {
      status: 409,
      body: { error: `Field "${fieldName}" is a ${before.type} field: a field keeps its type` },
    }
  }

  if (idx >= 0) {
    fields[idx] = normalized
  } else {
    fields.push(normalized)
  }

  await ctx.adapter.saveRuntimeSchema(validated.collection, {
    collection: validated.collection,
    fields,
    metadata: existing?.metadata ?? [],
    updatedAt: new Date().toISOString(),
  })

  return { status: 200, body: { message: 'Field saved', field: normalized } }
}
