import type { RuntimeFieldDefinition } from '@krantho/persistence'
import { collectionToJsonSchema } from '@krantho/schema'
import { getActiveContract } from '../merged-schema.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam } from '../validators.js'

/** GET /api/schema/:collection — JSON Schema for a collection's fields (code + runtime) */
export const getSchema: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const jsonSchema = collectionToJsonSchema(validated.collectionDef)

  // Merge runtime fields into the JSON Schema response
  if (ctx.adapter.getRuntimeSchema) {
    const runtimeSchema = await ctx.adapter.getRuntimeSchema(validated.collection)
    if (runtimeSchema && runtimeSchema.fields.length > 0) {
      const schema = jsonSchema.schema as {
        properties?: Record<string, Record<string, unknown>>
        required?: string[]
      }
      const properties = { ...(schema.properties ?? {}) }
      const required = [...(schema.required ?? [])]
      const codeFieldNames = new Set(Object.keys(schema.properties ?? {}))

      for (const field of runtimeSchema.fields) {
        if (codeFieldNames.has(field.name)) continue
        properties[field.name] = runtimeFieldToJsonSchema(field)
        if (field.required) {
          required.push(field.name)
        }
      }

      jsonSchema.schema = { ...schema, properties, required }
    }
  }

  const contract = await getActiveContract(validated.collectionDef, ctx.adapter)
  return { status: 200, body: { ...jsonSchema, contract } }
}

function runtimeFieldToJsonSchema(field: RuntimeFieldDefinition): Record<string, unknown> {
  const prop: Record<string, unknown> = { _runtime: true }

  switch (field.type) {
    case 'string':
    case 'textarea':
    case 'date':
    case 'color':
    case 'reference':
      prop['type'] = 'string'
      break
    case 'number':
      prop['type'] = 'number'
      break
    case 'boolean':
      prop['type'] = 'boolean'
      break
    case 'url':
      prop['type'] = 'string'
      prop['format'] = 'uri'
      break
    case 'email':
      prop['type'] = 'string'
      prop['format'] = 'email'
      break
    case 'enum':
      prop['type'] = 'string'
      if (field.enumValues) prop['enum'] = field.enumValues
      break
  }

  if (field.isArray)
    return {
      type: 'array',
      items: {
        ...prop,
        ...(field.refCollection ? { description: `ref:${field.refCollection}` } : {}),
      },
      _runtime: true,
    }

  if (field.default !== undefined) prop['default'] = field.default
  if (field.description) prop['description'] = field.description
  if (field.min !== undefined) {
    prop[field.type === 'number' ? 'minimum' : 'minLength'] = field.min
  }
  if (field.max !== undefined) {
    prop[field.type === 'number' ? 'maximum' : 'maxLength'] = field.max
  }
  if (field.pattern) prop['pattern'] = field.pattern
  if (field.refCollection) prop['description'] = `ref:${field.refCollection}`

  return prop
}
