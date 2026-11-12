import { fromJSONSchema, toJSONSchema, type ZodObject, type ZodRawShape } from 'zod'

// Zod can normalize a JSON Schema format into a different set of checks. Retain
// the reviewed portable definition so code adoption preserves its exact identity.
const definitions = new WeakMap<ZodObject<ZodRawShape>, Record<string, unknown>>()

export function fromPortableJsonSchema(
  definition: Record<string, unknown>,
): ZodObject<ZodRawShape> {
  const schema = fromJSONSchema(definition) as ZodObject<ZodRawShape>
  if (schema.type !== 'object') throw new Error('A portable author schema must define an object')
  definitions.set(schema, structuredClone(definition))
  return schema
}

export function portableJsonSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
  return structuredClone(definitions.get(schema) ?? toJSONSchema(schema.strict()))
}

/** Extending an adopted contract preserves the definitions of its existing fields. */
export function retainPortableExtension(
  original: ZodObject<ZodRawShape>,
  additions: ZodObject<ZodRawShape>,
  extended: ZodObject<ZodRawShape>,
): void {
  if (!definitions.has(original)) return
  const base = portableJsonSchema(original)
  const extra = portableJsonSchema(additions)
  definitions.set(extended, {
    ...base,
    properties: { ...(base['properties'] as object), ...(extra['properties'] as object) },
    required: [
      ...((base['required'] as string[]) ?? []),
      ...((extra['required'] as string[]) ?? []),
    ],
  })
}
