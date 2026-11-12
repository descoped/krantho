import { PROVIDER_PRESETS, type Provider, type ProviderPreset } from '@krantho/ai'
import type { LLMKeySource, LLMProviderStatus, LLMSettings, LLMTestResult } from '../lib/api.js'

/**
 * Setup › AI provider: a provider is on when it has a key. The names and the default models
 * come from `PROVIDER_PRESETS` in `@krantho/ai` — Studio keeps no list of its own.
 */

/** The provider that runs on the Claude subscription token: development only, no key to paste */
export const CLAUDE_CODE: Provider = 'claude-code'

/** The provider that runs on the person's own computer: no key, an address instead */
export const LOCAL_MODEL: Provider = 'ollama'

/** The providers a developer sets up: the rest are for everyone */
const DEVELOPER_PROVIDERS: readonly string[] = ['openrouter', CLAUDE_CODE, LOCAL_MODEL]

export function isProvider(value: string): value is Provider {
  return Object.hasOwn(PROVIDER_PRESETS, value)
}

export function presetOf(provider: string): ProviderPreset | null {
  return isProvider(provider) ? PROVIDER_PRESETS[provider] : null
}

/** The provider as a person knows it: "ChatGPT", not "openai" */
export function providerName(provider: string): string {
  return presetOf(provider)?.label ?? provider
}

/** Who makes it: "OpenAI" */
export function vendorName(provider: string): string {
  return presetOf(provider)?.vendor ?? provider
}

/** Whether the provider is one a developer sets up */
export function isDeveloperProvider(provider: string): boolean {
  return DEVELOPER_PROVIDERS.includes(provider)
}

/** The providers that are on, the one in use first, then in the order the server lists them */
export function readyProviders(settings: LLMSettings): LLMProviderStatus[] {
  return settings.providers
    .filter((entry) => entry.ready)
    .sort((a, b) => Number(b.active) - Number(a.active))
}

/** The providers anyone can turn on by adding a key, that are not on yet */
export function availableProviders(settings: LLMSettings): LLMProviderStatus[] {
  return settings.providers.filter((entry) => !entry.ready && !isDeveloperProvider(entry.provider))
}

/** The providers a developer sets up, that are not on yet */
export function developerProviders(settings: LLMSettings): LLMProviderStatus[] {
  return settings.providers.filter((entry) => !entry.ready && isDeveloperProvider(entry.provider))
}

/** The one line at the top: whether AI help works, and which AI does it */
export function statusLine(settings: LLMSettings, canChange = true): string {
  if (!settings.configured || !settings.provider) {
    return canChange
      ? 'AI help is off. Add a key below to turn it on.'
      : 'AI help is off. An admin can add a key to turn it on.'
  }
  return `AI help is on, using ${providerName(settings.provider)}.`
}

/** "ChatGPT · gpt-4o", the AI a run across the site uses */
export function modelName(settings: LLMSettings): string {
  if (!settings.configured || !settings.provider) return 'The AI'
  return `${providerName(settings.provider)} · ${settings.model ?? 'its default model'}`
}

/** Where a key comes from, in words a person uses */
export function keySourceText(source: LLMKeySource | null): string {
  if (source === 'saved') return 'Key saved here, encrypted.'
  if (source === 'environment' || source === 'configuration') return 'Set up by your developer.'
  return 'Runs on your own computer.'
}

const KEY_REFUSED = /401|403|unauthori[sz]ed|invalid|incorrect|api[ -]?key|permission/i

/** What a test found, as a sentence a person can act on */
export function testSentence(provider: string, result: LLMTestResult): string {
  const name = providerName(provider)
  if (result.success) return `${name} works: it answered.`
  if (KEY_REFUSED.test(result.error ?? '')) {
    return `${name} did not accept the key. Check that you copied all of it.`
  }
  return `${name} did not answer: ${result.error ?? 'no reason given'}.`
}
