import { CLAUDE_CODE_PROVIDER } from '@krantho/ai'
import type { KranthoConfig } from '@krantho/config'
import { llmCredentialLeaf } from '@krantho/config'
import type { ISecretVault } from '@krantho/persistence'

/**
 * The error that says why `claude-code` is refused in a deployment, or null when
 * the provider is allowed. `NODE_ENV` is one of the deliberate direct environment reads.
 */
export function claudeCodeRefusal(provider: string): string | null {
  if (provider !== CLAUDE_CODE_PROVIDER || process.env['NODE_ENV'] !== 'production') return null
  return 'The claude-code provider is for development on your own machine. Use the anthropic provider with an API key in a deployment.'
}

/** Which kind of credential authenticates LLM calls */
export type LLMCredentialKind = 'oauth' | 'api-key' | 'none'

/** Where the active credential comes from */
export type LLMCredentialSource = 'env' | 'code' | 'database'

/** The credential chosen for a request, with where it came from */
export interface LLMCredential {
  kind: LLMCredentialKind
  source: LLMCredentialSource | null
  apiKey?: string | undefined
  authToken?: string | undefined
}

/** The site setting that holds one provider's stored API key — a key never crosses providers */
export function storedKeySetting(provider: string): string {
  return `llm.apiKey.${provider}`
}

/** The setting that holds the model chosen for one provider; unset means the provider's default */
export function storedModelSetting(provider: string): string {
  return `llm.model.${provider}`
}

/** The setting that holds the base URL chosen for one provider: a proxy, or a model on another machine */
export function storedBaseUrlSetting(provider: string): string {
  return `llm.baseUrl.${provider}`
}

/** Whether a provider authenticates with an API key a site can store: every provider but claude-code and ollama */
export function takesStoredKey(config: Pick<KranthoConfig, 'llm'>, provider: string): boolean {
  return llmCredentialLeaf(config.llm, provider)?.type === 'api-key'
}

/**
 * One provider's stored API key, opened by the vault, or null when none is stored,
 * the site has no vault, or the stored value is not one this vault can open (the
 * key rotated, or the value was not sealed by it) — the key is then entered again.
 */
export async function readStoredKey(
  adapter: { getSetting(key: string): Promise<string | null> },
  provider: string,
  vault: ISecretVault | undefined,
): Promise<string | null> {
  const sealed = await adapter.getSetting(storedKeySetting(provider))
  if (!sealed || !vault) return null
  return vault.open(storedKeySetting(provider), sealed)
}

/**
 * Pick one provider's LLM credential at request time, so toggling the
 * environment takes effect without touching the stored settings.
 *
 * `claude-code` uses its subscription token (`llm.claudeCode.authToken`) only.
 * Every other provider that has a credential uses its own API key only: from the
 * configuration (`llm.<provider>.apiKey`, from the environment or the app's code),
 * then the key stored for that provider.
 * One provider's key or token is never read for another; ollama has none.
 */
export function resolveLLMCredential(
  provider: string,
  config: Pick<KranthoConfig, 'llm' | 'sources'>,
  storedKey: string | null,
): LLMCredential {
  const leaf = llmCredentialLeaf(config.llm, provider)
  if (!leaf) return { kind: 'none', source: null }
  if (leaf.type === 'oauth') {
    if (!leaf.value) return { kind: 'none', source: null }
    const source = config.sources.get(leaf.path) === 'code' ? 'code' : 'env'
    return { kind: 'oauth', source, authToken: leaf.value }
  }
  const source = config.sources.get(leaf.path)
  if (leaf.value && (source === 'env' || source === 'code')) {
    return { kind: 'api-key', source, apiKey: leaf.value }
  }
  if (storedKey) {
    return { kind: 'api-key', source: 'database', apiKey: storedKey }
  }
  return { kind: 'none', source: null }
}
