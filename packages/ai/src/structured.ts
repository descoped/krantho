import {
  type CompletionResult,
  type LLMAdapter,
  type LLMOptions,
  StructuredOutputUnsupportedError,
} from './types.js'

/**
 * Send a prompt to an LLM and parse the response as typed JSON.
 *
 * On adapters with native structured output the schema is enforced
 * server-side and the reply is parsed directly. On other adapters — and on a
 * provider or model that refuses the schema, which no one has to configure —
 * the schema is embedded in the prompt and the reply is extracted from raw,
 * fenced, or preamble-wrapped JSON.
 *
 * @example
 * ```ts
 * const result = await structuredComplete<{ description: string }>(
 *   llm,
 *   'Write a meta description for this page...',
 *   { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
 * )
 * console.log(result.description)
 * ```
 */
export async function structuredComplete<T>(
  llm: LLMAdapter,
  prompt: string,
  schema: Record<string, unknown>,
  options?: LLMOptions,
): Promise<T> {
  if (llm.supportsJsonSchema) {
    try {
      const result = await llm.complete(prompt, {
        ...options,
        jsonSchema: withClosedObjects(schema),
      })
      return parseStructured<T>(result)
    } catch (err: unknown) {
      // A provider or model that takes no schema-constrained reply: the prompt carries the schema
      if (!(err instanceof StructuredOutputUnsupportedError)) throw err
    }
  }

  const wrappedPrompt = `${prompt}

Respond with a JSON object matching this schema and nothing else:
${JSON.stringify(schema, null, 2)}`

  const result = await llm.complete(wrappedPrompt, options)
  return extractJson<T>(result.text)
}

/** Parse a natively structured reply, naming truncation and malformed payloads explicitly. */
function parseStructured<T>(result: CompletionResult): T {
  if (result.finishReason === 'max_tokens') {
    throw new Error(
      `LLM response truncated at max_tokens; raise maxTokens. Partial text: ${result.text.slice(0, 200)}`,
    )
  }
  try {
    return JSON.parse(result.text) as T
  } catch {
    throw new Error(`Failed to parse structured LLM response: ${result.text.slice(0, 200)}`)
  }
}

/** Keys whose values are maps of sub-schemas, single sub-schemas, or lists of sub-schemas. */
const SCHEMA_MAP_KEYS = new Set(['properties', '$defs', 'definitions'])
const SCHEMA_NODE_KEYS = new Set(['items', 'additionalProperties', 'not', 'if', 'then', 'else'])
const SCHEMA_LIST_KEYS = new Set(['items', 'anyOf', 'allOf', 'oneOf', 'prefixItems'])

/**
 * Structured output requires `additionalProperties: false` on every object node; add it where absent.
 * Only schema positions are traversed, so object-valued `default`, `const` or `enum` data is left alone.
 */
function withClosedObjects(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (SCHEMA_MAP_KEYS.has(key) && isRecord(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [
          name,
          isRecord(sub) ? withClosedObjects(sub) : sub,
        ]),
      )
    } else if (SCHEMA_NODE_KEYS.has(key) && isRecord(value)) {
      out[key] = withClosedObjects(value)
    } else if (SCHEMA_LIST_KEYS.has(key) && Array.isArray(value)) {
      out[key] = value.map((item) => (isRecord(item) ? withClosedObjects(item) : item))
    } else {
      out[key] = value
    }
  }
  if (out.type === 'object' && out.additionalProperties === undefined) {
    out.additionalProperties = false
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Fallback parser for adapters without native structured output: raw, fenced, or preamble-wrapped JSON. */
function extractJson<T>(text: string): T {
  const trimmed = text.trim()

  // Try direct parse
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // continue
  }

  // Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T
    } catch {
      // continue
    }
  }

  // Find first {...} block (handles preamble text before JSON)
  const braceStart = trimmed.indexOf('{')
  const braceEnd = trimmed.lastIndexOf('}')
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(trimmed.slice(braceStart, braceEnd + 1)) as T
    } catch {
      // continue
    }
  }

  throw new Error(`Failed to extract JSON from LLM response: ${trimmed.slice(0, 200)}`)
}
