import type { Provider } from '@krantho/ai'
import {
  CLAUDE_CODE_MODEL,
  CLAUDE_CODE_PROVIDER,
  claudeCodeModelError,
  PROVIDER_PRESETS,
} from '@krantho/ai'
import { LLM_PROVIDERS, llmCredentialLeaf } from '@krantho/config'
import type { ISiteSettingsAdapter } from '@krantho/persistence'
import { requireRole } from '../permissions.js'
import type { ApiContext, ApiHandler, ApiResponse } from '../types.js'
import { validateRequestBody } from '../validators.js'
import type { LLMCredentialSource } from './llm-credential.js'
import {
  claudeCodeRefusal,
  storedBaseUrlSetting,
  storedKeySetting,
  storedModelSetting,
  takesStoredKey,
} from './llm-credential.js'
import {
  activeProvider,
  providerCredential,
  readyProviders,
  resolveAdapter,
} from './llm-resolve.js'

/** Return a 501 response if siteSettingsAdapter is not available, null otherwise. */
function requireSiteSettings(
  ctx: ApiContext,
):
  | { error: ApiResponse; adapter?: undefined }
  | { error?: undefined; adapter: ISiteSettingsAdapter } {
  if (!ctx.siteSettingsAdapter) {
    return { error: { status: 501, body: { error: 'Site settings storage not available' } } }
  }
  return { adapter: ctx.siteSettingsAdapter }
}

/** The provider that runs on the person's own computer: on once chosen, with no key */
const LOCAL_MODEL = 'ollama'

/** Why a pasted key is refused: nothing to encrypt it with */
const NO_VAULT =
  "This site cannot store a key: no secrets key is configured. Set secrets.local.key (KRANTHO_SECRETS_LOCAL_KEY) or auth.jwtSecret (KRANTHO_JWT_SECRET), at least 32 characters, or set the provider's key as an environment variable."

/** The model a provider runs: `claude-code` always the pinned one, others the chosen one or the preset's */
function reportedModel(provider: string, chosen: string | null): string | null {
  if (provider === CLAUDE_CODE_PROVIDER) return CLAUDE_CODE_MODEL
  return chosen ?? PROVIDER_PRESETS[provider as Provider]?.defaultModel ?? null
}

/** A 400 for settings the provider cannot run: refused in production, or not its pinned model */
function claudeCodeViolation(provider: string, model: unknown): ApiResponse | null {
  const refusal = claudeCodeRefusal(provider)
  if (refusal) return { status: 400, body: { error: refusal } }
  const modelError =
    provider === CLAUDE_CODE_PROVIDER && typeof model === 'string' && model !== ''
      ? claudeCodeModelError(model)
      : null
  if (modelError) return { status: 400, body: { error: modelError } }
  return null
}

function isKnownProvider(provider: unknown): provider is (typeof LLM_PROVIDERS)[number] {
  return typeof provider === 'string' && (LLM_PROVIDERS as readonly string[]).includes(provider)
}

/** Where a provider's key comes from, in words a person uses — never the key */
export type KeySource = 'environment' | 'configuration' | 'saved'

const KEY_SOURCE: Record<LLMCredentialSource, KeySource> = {
  env: 'environment',
  code: 'configuration',
  database: 'saved',
}

/** One provider as the settings report it: whether it is on, whether it is in use, and what it was given */
interface ProviderStatus {
  provider: string
  /** The provider has a key, so it is on */
  ready: boolean
  /** The provider the site uses */
  active: boolean
  /** Where its key comes from; null when it has none */
  keySource: KeySource | null
  /** The variable that sets its key, for a developer; empty for a provider with none */
  env: string
  /** The model chosen for it; null for its default */
  model: string | null
  /** The base URL chosen for it; null for its own */
  baseUrl: string | null
}

async function providerStatus(
  ctx: ApiContext,
  adapter: ISiteSettingsAdapter,
  provider: string,
  ready: readonly string[],
  active: string | null,
): Promise<ProviderStatus> {
  const credential = await providerCredential(ctx, provider)
  return {
    provider,
    ready: ready.includes(provider),
    active: provider === active,
    keySource: credential.source ? KEY_SOURCE[credential.source] : null,
    env: llmCredentialLeaf(ctx.config.llm, provider)?.env ?? '',
    model: (await adapter.getSetting(storedModelSetting(provider))) || null,
    baseUrl: (await adapter.getSetting(storedBaseUrlSetting(provider))) || null,
  }
}

/**
 * What `GET`, `PUT` and `DELETE` report: every provider with whether it is on, the one in use,
 * and the provider `assistant.provider` gives the assistant — never a key or a token.
 */
async function describeSettings(
  ctx: ApiContext,
  adapter: ISiteSettingsAdapter,
): Promise<Record<string, unknown>> {
  const ready = await readyProviders(ctx)
  const active = await activeProvider(ctx)
  const providers = await Promise.all(
    LLM_PROVIDERS.map((name) => providerStatus(ctx, adapter, name, ready, active)),
  )
  const inUse = providers.find((entry) => entry.active)
  return {
    configured: inUse?.ready === true,
    provider: inUse?.ready === true ? inUse.provider : null,
    model: inUse?.ready === true ? reportedModel(inUse.provider, inUse.model) : null,
    providers,
    assistantProvider: ctx.config.assistant.provider ?? null,
  }
}

/** GET /api/settings/llm — which providers are on and which one is in use (never returns a key or token) */
export const getLLMSettings: ApiHandler = async (_req, ctx) => {
  const settings = requireSiteSettings(ctx)
  if (settings.error) return settings.error

  return { status: 200, body: await describeSettings(ctx, settings.adapter) }
}

/** Save one provider's key, model and base URL; an empty model or base URL clears it */
async function saveProvider(
  ctx: ApiContext,
  adapter: ISiteSettingsAdapter,
  provider: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { apiKey, model, baseUrl } = payload
  if (typeof apiKey === 'string' && apiKey.length > 0 && ctx.secrets) {
    const name = storedKeySetting(provider)
    await adapter.setSetting(name, await ctx.secrets.seal(name, apiKey))
  }
  if (typeof model === 'string') await adapter.setSetting(storedModelSetting(provider), model)
  if (typeof baseUrl === 'string') await adapter.setSetting(storedBaseUrlSetting(provider), baseUrl)
}

/**
 * PUT /api/settings/llm — save one provider's key, model and base URL (`{ provider, apiKey?,
 * model?, baseUrl?, use? }`). The first provider with a key becomes the one in use; a later one
 * is used only when `use` is true, and what was in use stays. Nothing else is touched.
 */
export const updateLLMSettings: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const settings = requireSiteSettings(ctx)
  if (settings.error) return settings.error

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const { provider, model, apiKey } = payload

  if (!isKnownProvider(provider)) {
    return {
      status: 400,
      body: { error: `Invalid provider. Must be one of: ${LLM_PROVIDERS.join(', ')}` },
    }
  }

  const violation = claudeCodeViolation(provider, model)
  if (violation) return violation

  const keyGiven =
    typeof apiKey === 'string' && apiKey.length > 0 && takesStoredKey(ctx.config, provider)
  if (keyGiven && !ctx.secrets) return { status: 400, body: { error: NO_VAULT } }

  const readyBefore = await readyProviders(ctx)
  const inUse = await activeProvider(ctx)
  // What is in use stays in use: a later key must not change the provider by sorting first. This
  // makes an implicit pick (the first provider with a key) an explicit choice, on purpose.
  if (inUse && readyBefore.includes(inUse)) await settings.adapter.setSetting('llm.provider', inUse)

  await saveProvider(ctx, settings.adapter, provider, {
    ...payload,
    apiKey: keyGiven ? apiKey : '',
  })
  if (payload['use'] === true || readyBefore.length === 0) {
    // A provider with no key cannot be used; a local model has none and is on once chosen
    const hasKey = (await providerCredential(ctx, provider)).kind !== 'none'
    if (payload['use'] === true && !hasKey && provider !== LOCAL_MODEL) {
      return { status: 400, body: { error: 'That AI has no key yet. Add its key first.' } }
    }
    await settings.adapter.setSetting('llm.provider', provider)
  }

  return { status: 200, body: await describeSettings(ctx, settings.adapter) }
}

/**
 * DELETE /api/settings/llm?provider=… — remove what was saved here for one provider: its key,
 * model and base URL. A key from the environment or the code stays, as it is not stored here.
 */
export const deleteLLMSettings: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const settings = requireSiteSettings(ctx)
  if (settings.error) return settings.error

  const provider = req.query['provider']
  if (!isKnownProvider(provider)) {
    return {
      status: 400,
      body: { error: `Name the provider to remove: one of ${LLM_PROVIDERS.join(', ')}` },
    }
  }

  await settings.adapter.setSetting(storedKeySetting(provider), '')
  await settings.adapter.setSetting(storedModelSetting(provider), '')
  await settings.adapter.setSetting(storedBaseUrlSetting(provider), '')
  if ((await settings.adapter.getSetting('llm.provider')) === provider) {
    await settings.adapter.setSetting('llm.provider', '')
  }

  return { status: 200, body: await describeSettings(ctx, settings.adapter) }
}

/** POST /api/settings/llm/test — test a provider (`{ provider? }`, default the one in use) with a minimal request */
export const testLLMConnection: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const settings = requireSiteSettings(ctx)
  if (settings.error) return settings.error

  const named = (req.body as { provider?: unknown } | undefined)?.provider
  if (named !== undefined && !isKnownProvider(named)) {
    return { status: 400, body: { error: 'Unknown provider' } }
  }
  const provider = named ?? (await activeProvider(ctx))
  if (!provider) {
    return { status: 400, body: { error: 'No AI provider is set up' } }
  }

  try {
    const adapter = await resolveAdapter(ctx, provider)
    const result = await adapter.complete('Reply with exactly: OK', {
      maxTokens: 256,
    })

    return {
      status: 200,
      body: {
        success: true,
        provider,
        model: result.model,
        usage: result.usage,
      },
    }
  } catch (err: unknown) {
    return {
      status: 200,
      body: {
        success: false,
        provider,
        error: err instanceof Error ? err.message : 'Connection failed',
      },
    }
  }
}
