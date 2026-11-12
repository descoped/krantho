import { type ModelProfile, resolveModelProfile } from './model-profile.js'
import {
  CLAUDE_CODE_MODEL,
  CLAUDE_CODE_PROVIDER,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from './providers.js'
import type { LLMConfig } from './types.js'

/** What an adapter factory needs from a configuration: the preset, endpoint, model and credentials. */
export interface ResolvedProvider {
  preset: ProviderPreset
  baseUrl: string
  model: string
  /** How requests to the model are shaped; carried by the OpenAI-compatible providers only */
  profile: ModelProfile
  /** The API key; `undefined` for `claude-code`, which never uses one. */
  apiKey: string | undefined
  /** The subscription token; set for `claude-code` only, no other provider reads it. */
  authToken: string | undefined
}

/**
 * Why a model cannot run on `claude-code`, or null when it can (unset counts): the
 * provider runs only its pinned model, so another is an error, not a downgrade.
 */
export function claudeCodeModelError(model: string | undefined): string | null {
  if (model === undefined || model === '' || model === CLAUDE_CODE_MODEL) return null
  return `The claude-code provider runs only ${CLAUDE_CODE_MODEL}; "${model}" is not available. Use the anthropic provider with an API key to choose another model.`
}

/**
 * Resolve a configuration against its provider preset and check its credentials.
 *
 * `claude-code` requires `authToken`, never uses `apiKey`, and runs only its pinned
 * model — a configured model that differs is an error, not a silent downgrade. Every
 * other provider uses `apiKey` only and never reads `authToken`.
 */
export function resolveProvider(config: LLMConfig): ResolvedProvider {
  const preset = PROVIDER_PRESETS[config.provider]
  if (!preset) {
    throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
  const baseUrl = config.baseUrl ?? preset.baseUrl

  if (config.provider !== CLAUDE_CODE_PROVIDER) {
    const model = config.model ?? preset.defaultModel
    return {
      preset,
      baseUrl,
      model,
      profile: resolveModelProfile(config.provider, model, config.profiles),
      apiKey: config.apiKey,
      authToken: undefined,
    }
  }
  if (config.authToken === undefined || config.authToken === '') {
    throw new Error(
      'The claude-code provider needs a subscription token: run `claude setup-token` and pass the token as authToken. It never uses an API key.',
    )
  }
  const modelError = claudeCodeModelError(config.model)
  if (modelError) throw new Error(modelError)
  return {
    preset,
    baseUrl,
    model: CLAUDE_CODE_MODEL,
    // Resolved for its check alone: an override keyed by the pinned model fails here, not silently
    profile: resolveModelProfile(config.provider, CLAUDE_CODE_MODEL, config.profiles),
    apiKey: undefined,
    authToken: config.authToken,
  }
}
