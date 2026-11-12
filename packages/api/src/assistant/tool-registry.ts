import type { ChatTool } from '@krantho/ai'
import { z } from 'zod'
import { hasRole } from '../permissions.js'
import type { ApiContext } from '../types.js'
import { ACTION_TOOLS } from './tools/action-tools.js'
import { AEO_TOOLS } from './tools/aeo-tools.js'
import type { AssistantTool } from './tools/define-tool.js'
import { DRAFT_TOOLS } from './tools/draft-tools.js'
import { READ_TOOLS } from './tools/read-tools.js'
import { SEO_TOOLS } from './tools/seo-tools.js'

export type { AssistantTool, ToolOutcome, ToolRunContext } from './tools/define-tool.js'

/** Every tool the assistant has */
export const ASSISTANT_TOOLS: readonly AssistantTool[] = [
  ...READ_TOOLS,
  ...DRAFT_TOOLS,
  ...SEO_TOOLS,
  ...AEO_TOOLS,
  ...ACTION_TOOLS,
]

/** Tools offered to this user: available here and within the user's role */
export function toolsForUser(ctx: ApiContext): AssistantTool[] {
  const user = ctx.auth
  if (!user) return []
  return ASSISTANT_TOOLS.filter((tool) => tool.available(ctx) && hasRole(user, tool.role))
}

/** The JSON Schema keywords every provider accepts in a tool's input schema */
export const PORTABLE_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
])

/**
 * A JSON Schema reduced to the portable keywords, recursively. An object
 * without `properties` (a record) becomes a plain object; the zod schema still
 * validates every call on the server.
 */
export function portableSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const reduced: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!PORTABLE_KEYWORDS.has(key)) continue
    if (key === 'properties' && value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, Record<string, unknown>>)
      reduced[key] = Object.fromEntries(entries.map(([name, prop]) => [name, portableSchema(prop)]))
    } else if (key === 'items' && value && typeof value === 'object' && !Array.isArray(value)) {
      reduced[key] = portableSchema(value as Record<string, unknown>)
    } else {
      reduced[key] = value
    }
  }
  return reduced
}

/** ChatTool definitions: name, description, and the input's JSON Schema reduced to the portable subset */
export function toolDefinitions(tools: readonly AssistantTool[]): ChatTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: portableSchema(z.toJSONSchema(tool.input) as Record<string, unknown>),
  }))
}
