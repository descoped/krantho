import { PROVIDER_PRESETS, type Provider } from '@krantho/ai'
import { readyProviders, resolveChatAdapter } from '../handlers/llm-resolve.js'
import type { ApiHandler } from '../types.js'
import { requireAssistantUser } from './access.js'
import { toolsForUser } from './tool-registry.js'

/**
 * GET /api/assistant — the provider and model, the kind of credential (never
 * the credential), the providers the user can pick from, the tools this user may
 * use and the limits; or why the assistant cannot run (`configured: false`).
 */
export const assistantStatus: ApiHandler = async (_req, ctx) => {
  const access = requireAssistantUser(ctx)
  if (!access.ok) return access.response

  const { assistant } = ctx.config
  try {
    const { chat, credential } = await resolveChatAdapter(ctx, assistant)
    return {
      status: 200,
      body: {
        configured: true,
        provider: chat.provider,
        model: chat.model,
        credential,
        providers: (await readyProviders(ctx)).map((provider) => ({
          provider,
          label: PROVIDER_PRESETS[provider as Provider].label,
        })),
        tools: toolsForUser(ctx).map((tool) => ({ name: tool.name, label: tool.label })),
        limits: assistant.limits,
        confirmTtlSec: assistant.confirmTtlSec,
      },
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'The LLM is not configured'
    return { status: 200, body: { configured: false, error } }
  }
}
