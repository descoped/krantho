import { storedBaseUrlSetting, storedModelSetting } from '@krantho/api'
import type { KranthoConfig, KranthoConfigInput } from '@krantho/config'
import { llmCredentialLeaf } from '@krantho/config'

/** The slice of the site settings store seeding uses */
interface SettingsStore {
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
}

/** Whether the operator or the developer chose the provider, rather than the default standing */
function providerChosen(config: KranthoConfig): boolean {
  return config.sources.get('llm.provider') !== 'default'
}

/**
 * Whether boot should seed the stored LLM settings: the app's code passed an
 * `llm` block, or the environment chose a provider and supplied that provider's
 * own key. Any other `llm.*` variable alone is not enough — a lone credential
 * for a provider nobody chose must not pick one silently, and a provider
 * without a credential would stand in the way of a key supplied later.
 */
export function shouldSeedLlm(code: KranthoConfigInput, config: KranthoConfig): boolean {
  if (code.llm !== undefined) return true
  if (config.sources.get('llm.provider') !== 'env') return false
  const leaf = llmCredentialLeaf(config.llm, config.llm.provider)
  return leaf?.type === 'api-key' && config.sources.get(leaf.path) === 'env'
}

/**
 * Seed LLM config from developer-defined defaults: the provider, model and base URL.
 * Idempotent — a provider is stored only while none is; a key without a chosen
 * provider seeds no provider. Admin overrides via Setup › AI provider are always preserved.
 * No credential is ever stored: the API reads each provider's key, and the
 * subscription token of the claude-code provider, from the configuration per request,
 * so a key the deployment injects stays out of the database.
 */
export async function seedLlmConfig(config: KranthoConfig, adapter: SettingsStore): Promise<void> {
  if (await adapter.getSetting('llm.provider')) return // Already configured — don't overwrite

  const { llm } = config
  if (providerChosen(config)) {
    await adapter.setSetting('llm.provider', llm.provider)
    if (llm.model) await adapter.setSetting(storedModelSetting(llm.provider), llm.model)
    if (llm.baseUrl) await adapter.setSetting(storedBaseUrlSetting(llm.provider), llm.baseUrl)
  }
}
