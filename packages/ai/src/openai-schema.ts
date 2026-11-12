import { isRecord } from './chat-transport.js'
import type { ChatTool } from './chat-types.js'

const JSON_NOTE = 'Pass a JSON object, encoded as a string.'

/** A property that is an object without named properties: free-form, as a record is */
function isOpenObject(schema: Record<string, unknown>): boolean {
  if (schema.type !== 'object') return false
  return !isRecord(schema.properties) || Object.keys(schema.properties).length === 0
}

/** A tool as a provider that rejects an object without properties takes it */
export interface DeclaredTool {
  /** The input schema to send, or undefined to send none (the tool takes no arguments) */
  parameters: Record<string, unknown> | undefined
  /** The property paths declared as strings, each a path of property names from the input's root */
  paths: string[][]
}

/**
 * Follows `properties` only. An open-ended object inside an array's `items` or under
 * `anyOf` is left as it is: no tool declares one (the Gemini case of the assistant's
 * vendor tests walks every tool's whole schema and fails if one does).
 */
function declareProperties(
  schema: Record<string, unknown>,
  path: readonly string[],
  paths: string[][],
): Record<string, unknown> {
  const properties = schema.properties
  if (!isRecord(properties)) return schema
  const declared: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(properties)) {
    if (!isRecord(value)) {
      declared[name] = value
    } else if (isOpenObject(value)) {
      const description = typeof value.description === 'string' ? `${value.description} ` : ''
      declared[name] = { type: 'string', description: `${description}${JSON_NOTE}` }
      paths.push([...path, name])
    } else {
      declared[name] = declareProperties(value, [...path, name], paths)
    }
  }
  return { ...schema, properties: declared }
}

/**
 * The tool as a provider that rejects an object without properties takes it: a tool with
 * no arguments sends no parameters, and each open-ended object property becomes a string
 * the model fills with JSON. Its path is returned so the arguments of a call can be decoded
 * again by {@link decodeOpenObjects}.
 */
export function declareOpenObjects(tool: ChatTool): DeclaredTool {
  if (isOpenObject(tool.inputSchema)) return { parameters: undefined, paths: [] }
  const paths: string[][] = []
  return { parameters: declareProperties(tool.inputSchema, [], paths), paths }
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function decodeAt(node: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) return node
  const value = node[head]
  if (rest.length === 0) {
    const parsed = typeof value === 'string' ? parseObject(value) : undefined
    return parsed === undefined ? node : { ...node, [head]: parsed }
  }
  return isRecord(value) ? { ...node, [head]: decodeAt(value, rest) } : node
}

/**
 * A call's arguments with the declared strings decoded to objects. A value that is already
 * an object, or a string that is not a JSON object, is left as it is: the tool's own
 * validation then accepts it or tells the model what to fix.
 */
export function decodeOpenObjects(
  input: Record<string, unknown>,
  paths: readonly string[][],
): Record<string, unknown> {
  return paths.reduce((decoded, path) => decodeAt(decoded, path), input)
}
