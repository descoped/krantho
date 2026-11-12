import type { RuntimeFieldDefinition } from '@krantho/persistence'
import type { ZodObject, ZodRawShape, ZodType } from 'zod'
import { z } from 'zod'
import { retainPortableExtension } from './portable-schema.js'

/**
 * Convert a single runtime field definition to a Zod type.
 * @internal Used only by mergeSchemas()
 */
export function runtimeFieldToZod(field: RuntimeFieldDefinition): ZodType {
  let schema: ZodType

  switch (field.type) {
    case 'string':
    case 'textarea': {
      let s = z.string()
      if (field.min !== undefined) s = s.min(field.min)
      if (field.max !== undefined) s = s.max(field.max)
      if (field.pattern) s = s.regex(new RegExp(field.pattern))
      schema = s
      break
    }
    case 'number': {
      let n = z.number()
      if (field.min !== undefined) n = n.min(field.min)
      if (field.max !== undefined) n = n.max(field.max)
      schema = n
      break
    }
    case 'boolean':
      schema = z.boolean()
      break
    case 'date':
      schema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]) // portable ISO date or date-time
      break
    case 'enum': {
      const values = (field.enumValues ?? []).filter((v) => typeof v === 'string')
      if (values.length < 2) {
        schema = z.string()
      } else {
        schema = z.enum(values as [string, string, ...string[]])
      }
      break
    }
    case 'url':
      schema = z.string().url()
      break
    case 'email':
      schema = z.string().email()
      break
    case 'color':
      schema = z.string()
      break
    case 'reference':
      schema = z.string()
      if (field.refCollection) {
        schema = z.string().describe(`ref:${field.refCollection}`)
      }
      break
    default:
      // Development warning — unknown types fall back to string
      console.warn(
        `[schema] Unknown field type "${field.type}" for "${field.name}", defaulting to string`,
      )
      schema = z.string()
  }

  if (field.isArray) schema = z.array(schema)

  if (field.default !== undefined) {
    schema = schema.default(field.default)
  }

  if (!field.required) {
    schema = schema.optional()
  }

  if (field.description && field.type !== 'reference') {
    schema = schema.describe(field.description)
  }

  return schema
}

/**
 * Build a Zod object schema from runtime field definitions.
 * @internal Used only by mergeSchemas()
 */
export function runtimeFieldsToZod(fields: RuntimeFieldDefinition[]): ZodObject<ZodRawShape> {
  const shape: Record<string, ZodType> = {}
  for (const field of fields) {
    shape[field.name] = runtimeFieldToZod(field)
  }
  return z.object(shape) as ZodObject<ZodRawShape>
}

/**
 * Merge a code-defined Zod schema with runtime field definitions.
 * Code fields take precedence — runtime fields only add new keys.
 * Returns a new schema that validates both code and runtime fields.
 */
export function mergeSchemas(
  codeSchema: ZodObject<ZodRawShape>,
  runtimeFields: RuntimeFieldDefinition[],
): ZodObject<ZodRawShape> {
  if (runtimeFields.length === 0) return codeSchema

  // Get code-defined field names
  const codeFieldNames = new Set(Object.keys(codeSchema.shape))

  // Only include runtime fields that don't conflict with code
  const newFields = runtimeFields.filter((f) => !codeFieldNames.has(f.name))
  if (newFields.length === 0) return codeSchema

  // Build the runtime-only schema and extend the code schema
  const runtimeZod = runtimeFieldsToZod(newFields)
  const extended = codeSchema.extend(runtimeZod.shape) as ZodObject<ZodRawShape>
  retainPortableExtension(codeSchema, runtimeZod, extended)
  return extended
}

/**
 * Generate Zod code string from code JSON Schema + runtime fields.
 * Used for the "Export" feature in Studio schema editor.
 */
export function exportSchemaAsZod(
  collectionName: string,
  codeProperties: Record<string, Record<string, unknown>>,
  codeRequired: string[],
  runtimeFields: RuntimeFieldDefinition[],
): string {
  const lines: string[] = []
  const requiredSet = new Set(codeRequired)

  lines.push(`const ${collectionName} = defineCollection({`)
  lines.push(`  name: '${collectionName}',`)
  lines.push(`  source: 'filesystem',`)
  lines.push(`  directory: join(process.cwd(), 'content', '${collectionName}'),`)
  lines.push(`  schema: z.object({`)

  // Code-defined fields
  if (Object.keys(codeProperties).length > 0) {
    lines.push(`    // Code-defined fields`)
    for (const [name, prop] of Object.entries(codeProperties)) {
      lines.push(`    '${name}': ${jsonSchemaPropertyToZod(prop, requiredSet.has(name))},`)
    }
  }

  // Runtime fields
  if (runtimeFields.length > 0) {
    lines.push(`    // Runtime fields (added via Studio)`)
    for (const field of runtimeFields) {
      lines.push(`    '${field.name}': ${runtimeFieldToZodCode(field)},`)
    }
  }

  lines.push(`  }),`)
  lines.push(`})`)

  return lines.join('\n')
}

interface CodeGenTypeOptions {
  type: string
  enumValues?: string[] | undefined
  min?: number | undefined
  max?: number | undefined
  pattern?: string | undefined
  refCollection?: string | undefined
}

interface CodeGenModifierOptions {
  defaultValue?: unknown | undefined
  description?: string | undefined
  isRequired: boolean
}

/** Shared helper: build the base Zod type code from a type string and constraints */
function buildZodTypeCode(opts: CodeGenTypeOptions): string {
  const { type, enumValues, min, max, pattern, refCollection } = opts

  if (enumValues && enumValues.length >= 2) {
    return `z.enum([${enumValues.map((v) => `'${v}'`).join(', ')}])`
  }

  switch (type) {
    case 'number':
    case 'integer': {
      let code = 'z.number()'
      if (min !== undefined) code += `.min(${min})`
      if (max !== undefined) code += `.max(${max})`
      return code
    }
    case 'boolean':
      return 'z.boolean()'
    case 'url':
    case 'uri':
      return 'z.string().url()'
    case 'email':
      return 'z.string().email()'
    case 'reference':
      return `z.string().describe('ref:${refCollection ?? 'unknown'}')`
    default: {
      let code = 'z.string()'
      if (min !== undefined) code += `.min(${min})`
      if (max !== undefined) code += `.max(${max})`
      if (pattern) code += `.regex(/${pattern}/)`
      return code
    }
  }
}

/** Append default, description, and optional modifiers to a Zod code string */
function applyZodModifiers(code: string, opts: CodeGenModifierOptions): string {
  let result = code
  if (opts.defaultValue !== undefined) {
    result += `.default(${JSON.stringify(opts.defaultValue)})`
  }
  if (opts.description) {
    result += `.describe('${opts.description}')`
  }
  if (!opts.isRequired) {
    result += '.optional()'
  }
  return result
}

function jsonSchemaPropertyToZod(prop: Record<string, unknown>, isRequired: boolean): string {
  const type = typeof prop['type'] === 'string' ? prop['type'] : undefined
  const enumValues =
    Array.isArray(prop['enum']) && prop['enum'].every((v) => typeof v === 'string')
      ? (prop['enum'] as string[])
      : undefined
  const format = typeof prop['format'] === 'string' ? prop['format'] : undefined

  // Map JSON Schema format to our internal type names
  const effectiveType = format === 'email' ? 'email' : format === 'uri' ? 'uri' : (type ?? 'string')

  const code =
    type === 'array' && prop['items'] && typeof prop['items'] === 'object'
      ? `z.array(${jsonSchemaPropertyToZod(prop['items'] as Record<string, unknown>, true)})`
      : buildZodTypeCode({ type: effectiveType, enumValues })
  return applyZodModifiers(code, {
    defaultValue: prop['default'],
    isRequired,
  })
}

function runtimeFieldToZodCode(field: RuntimeFieldDefinition): string {
  const baseCode = buildZodTypeCode({
    type: field.type,
    enumValues: field.enumValues,
    min: field.min,
    max: field.max,
    pattern: field.pattern,
    refCollection: field.refCollection,
  })
  const scalarCode =
    field.type === 'date' ? 'z.union([z.iso.date(), z.iso.datetime({ offset: true })])' : baseCode
  const code = field.isArray ? `z.array(${scalarCode})` : scalarCode
  return applyZodModifiers(code, {
    defaultValue: field.default,
    description: field.type !== 'reference' ? field.description : undefined,
    isRequired: field.required ?? false,
  })
}
