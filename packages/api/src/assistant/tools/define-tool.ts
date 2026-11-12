import type { Role } from '@krantho/persistence'
import type { ZodObject, ZodRawShape, z } from 'zod'
import type { ApiContext } from '../../types.js'
import type { AssistantActivity } from '../protocol.js'
import type { WritePolicy } from '../write-policy.js'

/** What a tool runs with: the request's authenticated context and its write policy */
export interface ToolRunContext {
  /** The request's context, with the signed-in user in `auth` */
  ctx: ApiContext
  callId: string
  writes: WritePolicy
  /** Frames document text for the model with this request's nonce */
  frame: (source: string, text: string) => string
  signal: AbortSignal
  /** Counts a model call a tool makes itself toward the request's token budget */
  spend: (usage: { inputTokens: number; outputTokens: number }) => void
}

/** A tool's result for the model and the activity Studio shows */
export interface ToolOutcome {
  result: Record<string, unknown>
  activity: Omit<AssistantActivity, 'id' | 'tool'>
}

/** A server-side tool the model may call */
export interface AssistantTool {
  name: string
  /** A short human name, e.g. "Read documents" */
  label: string
  /** Shown in Studio before the result arrives */
  describe(input: Record<string, unknown>): string
  description: string
  input: ZodObject<ZodRawShape>
  /** The role the matching REST handler requires */
  role: Role
  /** Whether this deployment can run it */
  available(ctx: ApiContext): boolean
  /** Runs with input the `input` schema has validated */
  run(input: Record<string, unknown>, run: ToolRunContext): Promise<ToolOutcome>
}

/** A tool definition whose `describe` and `run` see the parsed input's type */
export interface ToolSpec<S extends ZodRawShape> {
  name: string
  label: string
  description: string
  input: ZodObject<S>
  role: Role
  available(ctx: ApiContext): boolean
  describe(input: z.infer<ZodObject<S>>): string
  run(input: z.infer<ZodObject<S>>, run: ToolRunContext): Promise<ToolOutcome>
}

/** Declare a tool; the loop validates every call with `input` before `run` sees it */
export function defineTool<S extends ZodRawShape>(spec: ToolSpec<S>): AssistantTool {
  return spec as unknown as AssistantTool
}
