import type { ChatAdapter, LLMAdapter, LLMConfig, Provider } from '@krantho/ai'
import { CLAUDE_CODE_PROVIDER, createChatAdapter, createLLMAdapter } from '@krantho/ai'
import type { KranthoConfig } from '@krantho/config'
import { claudeCodeTokenMissing, llmCredentialLeaf } from '@krantho/config'
import type { ISecretVault } from '@krantho/persistence'
import {
  claudeCodeRefusal,
  type LLMCredential,
  type LLMCredentialKind,
  readStoredKey,
  resolveLLMCredential,
  storedBaseUrlSetting,
  storedModelSetting,
} from './llm-credential.js'

/** What LLM resolution reads: the stored LLM settings and the configuration tree */
export interface LLMResolveContext {
  siteSettingsAdapter?: { getSetting(key: string): Promise<string | null> } | undefined
  config: Pick<KranthoConfig, 'llm' | 'sources'>
  secrets?: ISecretVault | undefined
}

type SettingsReader = NonNullable<LLMResolveContext['siteSettingsAdapter']>

function requireSettings(ctx: LLMResolveContext): SettingsReader {
  if (!ctx.siteSettingsAdapter) {
    throw new Error('Site settings storage not available')
  }
  return ctx.siteSettingsAdapter
}

/**
 * The order a provider is picked in when no one chose: the products most people have a key for
 * first. The subscription provider and a local model are never picked for a site: they are for
 * a developer, who chooses them.
 */
const PICK_ORDER: readonly string[] = ['anthropic', 'openai', 'gemini', 'openrouter']

/** The providers that can be on besides those in {@link PICK_ORDER} */
const CHOSEN_ONLY: readonly string[] = ['claude-code']

/** One provider's credential, or none for `claude-code` where it is refused */
export async function providerCredential(
  ctx: LLMResolveContext,
  provider: string,
): Promise<LLMCredential> {
  if (claudeCodeRefusal(provider)) return { kind: 'none', source: null }
  const storedKey = await readStoredKey(requireSettings(ctx), provider, ctx.secrets)
  return resolveLLMCredential(provider, ctx.config, storedKey)
}

/**
 * The providers that are on: each one with a key, from the environment, the code or the key
 * saved here, in the order one is picked, then the subscription provider with its token, and
 * the local model when it was chosen. Having a key is what turns a provider on.
 */
export async function readyProviders(ctx: LLMResolveContext): Promise<string[]> {
  const settings = requireSettings(ctx)
  const ready: string[] = []
  for (const provider of [...PICK_ORDER, ...CHOSEN_ONLY]) {
    if ((await providerCredential(ctx, provider)).kind !== 'none') ready.push(provider)
  }
  if ((await settings.getSetting('llm.provider')) === 'ollama') ready.push('ollama')
  return ready
}

/**
 * The provider in use: the one chosen, when it is on, else the first provider that is on and
 * is picked for a site, else the one chosen (so what is missing can be named), else none.
 */
export async function activeProvider(ctx: LLMResolveContext): Promise<string | null> {
  const chosen = (await requireSettings(ctx).getSetting('llm.provider')) || null
  const ready = await readyProviders(ctx)
  if (chosen && ready.includes(chosen)) return chosen
  return ready.find((provider) => PICK_ORDER.includes(provider)) ?? chosen
}

/** The model chosen for a provider, or undefined for its default */
async function storedModel(ctx: LLMResolveContext, provider: string): Promise<string | undefined> {
  return (await requireSettings(ctx).getSetting(storedModelSetting(provider))) || undefined
}

async function storedBaseUrl(
  ctx: LLMResolveContext,
  provider: string,
): Promise<string | undefined> {
  return (await requireSettings(ctx).getSetting(storedBaseUrlSetting(provider))) || undefined
}

/**
 * One provider's configuration with that provider's own credential, picked at
 * request time. Throws when `claude-code` is configured in production, or has
 * no subscription token.
 */
async function resolveProviderConfig(
  ctx: LLMResolveContext,
  provider: string,
  model: string | undefined,
): Promise<LLMConfig> {
  const refusal = claudeCodeRefusal(provider)
  if (refusal) throw new Error(refusal)

  const credential = await providerCredential(ctx, provider)
  if (provider === CLAUDE_CODE_PROVIDER && credential.kind === 'none') {
    const { env } = llmCredentialLeaf(ctx.config.llm, provider) ?? { env: '' }
    throw new Error(claudeCodeTokenMissing(env))
  }

  return {
    provider: provider as Provider,
    model,
    apiKey: credential.apiKey,
    authToken: credential.authToken,
    baseUrl: await storedBaseUrl(ctx, provider),
    profiles: ctx.config.llm.profiles,
  }
}

const NOT_SET_UP = 'AI help is not set up yet. Add a key in Setup › AI provider.'

/**
 * A provider's model and base URL with its own credential — the one in use unless one is
 * named. Throws when no provider is on, or when `claude-code` is chosen in production.
 */
export async function resolveLLMConfig(
  ctx: LLMResolveContext,
  provider?: string,
): Promise<LLMConfig> {
  const chosen = provider ?? (await activeProvider(ctx))
  if (!chosen) throw new Error(NOT_SET_UP)
  return resolveProviderConfig(ctx, chosen, await storedModel(ctx, chosen))
}

/** The kind of credential a resolved configuration carries — never the credential itself */
function credentialKind(config: LLMConfig): LLMCredentialKind {
  if (config.authToken) return 'oauth'
  if (config.apiKey) return 'api-key'
  return 'none'
}

/** The completion adapter (enrichment, connection test), for the provider in use unless one is named */
export async function resolveAdapter(
  ctx: LLMResolveContext,
  provider?: string,
): Promise<LLMAdapter> {
  return createLLMAdapter(await resolveLLMConfig(ctx, provider))
}

/** The assistant's chat adapter and the kind of credential it authenticates with */
export interface ResolvedChat {
  chat: ChatAdapter
  credential: LLMCredentialKind
}

/** The assistant's own choices (`assistant.provider`, `assistant.model`) */
export interface AssistantModelChoice {
  provider?: string | undefined
  model?: string | undefined
}

/**
 * The provider the assistant uses: the one the user picked in the dialog (`requested`), else
 * `assistant.provider`, else the provider in use. `assistant.model` replaces the model only
 * for the provider the site's settings gave the assistant; a provider a user picked runs its
 * own chosen model, or its default.
 */
async function resolveAssistantConfig(
  ctx: LLMResolveContext,
  assistant: AssistantModelChoice,
  requested: string | undefined,
): Promise<LLMConfig> {
  if (requested !== undefined && !(await readyProviders(ctx)).includes(requested)) {
    throw new Error('That AI is not set up. Add its key in Setup › AI provider.')
  }
  const provider = requested ?? assistant.provider ?? (await activeProvider(ctx))
  if (!provider) throw new Error(NOT_SET_UP)
  const model =
    requested === undefined && assistant.model ? assistant.model : await storedModel(ctx, provider)
  return resolveProviderConfig(ctx, provider, model)
}

/** The assistant's chat adapter */
export async function resolveChatAdapter(
  ctx: LLMResolveContext,
  assistant: AssistantModelChoice,
  requested?: string,
): Promise<ResolvedChat> {
  const config = await resolveAssistantConfig(ctx, assistant, requested)
  return { chat: createChatAdapter(config), credential: credentialKind(config) }
}
