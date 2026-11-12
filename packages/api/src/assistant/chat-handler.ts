import { llmCredentialLeaf } from '@krantho/config'
import { type ResolvedChat, resolveChatAdapter } from '../handlers/llm-resolve.js'
import { getMergedSchema } from '../merged-schema.js'
import type { ApiContext, ApiHandler, ApiResponse } from '../types.js'
import { highestRole, requireAssistantUser, requireJsonBody } from './access.js'
import { runAgentLoop, toChatHistory } from './agent-loop.js'
import { parseChatRequest } from './chat-request.js'
import { createEventStream, EVENT_STREAM_HEADERS } from './sse-stream.js'
import { buildSystemPrompt } from './system-prompt.js'
import { toolsForUser } from './tool-registry.js'
import { createFramer } from './untrusted.js'
import { WritePolicy } from './write-policy.js'

/** The chat adapter, or the 503 that says why the assistant cannot reach a model */
async function resolveChat(
  ctx: ApiContext,
  requested: string | undefined,
): Promise<{ ok: true; resolved: ResolvedChat } | { ok: false; response: ApiResponse }> {
  let resolved: ResolvedChat
  try {
    resolved = await resolveChatAdapter(ctx, ctx.config.assistant, requested)
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'The LLM is not configured'
    return { ok: false, response: { status: 503, body: { error, code: 'llm_unconfigured' } } }
  }
  if (resolved.credential === 'none' && resolved.chat.provider !== 'ollama') {
    const { provider } = resolved.chat
    const env = llmCredentialLeaf(ctx.config.llm, provider)?.env
    const error = `No credential for ${provider}. Set ${env ?? 'its key'} in the environment, or save a key for it in Setup › AI provider.`
    return { ok: false, response: { status: 503, body: { error, code: 'llm_credential_missing' } } }
  }
  return { ok: true, resolved }
}

/** Each collection's field names, from its merged schema (code and runtime fields) */
async function collectionFields(
  ctx: ApiContext,
): Promise<Array<{ name: string; fields: string[] }>> {
  const collections: Array<{ name: string; fields: string[] }> = []
  for (const [name, collectionDef] of ctx.contentConfig.collections) {
    const schema = await getMergedSchema(collectionDef, ctx.adapter)
    collections.push({ name, fields: Object.keys(schema.shape) })
  }
  return collections
}

/**
 * POST /api/assistant/chat — run the agent loop for the user's conversation and
 * stream its events (`text/event-stream`). Errors before the stream starts are
 * JSON: 400/413 request, 401/403 access, 415 content type, 503 no model.
 */
export const assistantChat: ApiHandler = async (req, ctx) => {
  const access = requireAssistantUser(ctx)
  if (!access.ok) return access.response
  const notJson = requireJsonBody(req)
  if (notJson) return notJson
  const parsed = parseChatRequest(req.body, ctx)
  if (!parsed.ok) return parsed.response
  const chat = await resolveChat(ctx, parsed.value.provider)
  if (!chat.ok) return chat.response

  const system = buildSystemPrompt({
    site: ctx.config.site,
    role: highestRole(access.user),
    context: parsed.value.context,
    collections: await collectionFields(ctx),
    today: new Date().toISOString().slice(0, 10),
  })
  const tools = toolsForUser(ctx)
  const framer = createFramer()
  const writes = new WritePolicy()
  const body = createEventStream(
    (emit, signal) =>
      runAgentLoop({
        chat: chat.resolved.chat,
        system,
        history: toChatHistory(parsed.value.messages),
        tools,
        run: { ctx, callId: '', writes, frame: framer.frame, signal },
        limits: ctx.config.assistant.limits,
        emit,
        signal,
      }),
    req.rawRequest?.signal,
  )
  return { status: 200, headers: { ...EVENT_STREAM_HEADERS }, body }
}
