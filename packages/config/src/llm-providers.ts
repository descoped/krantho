import { envNameFor, leafByPath } from './leaves.js'
import { getPath } from './object-path.js'
import type { LlmSection } from './types.js'

/** The LLM providers a site can use — the one list the schema and every consumer share */
export const LLM_PROVIDERS = [
  'anthropic',
  'claude-code',
  'openai',
  'gemini',
  'openrouter',
  'ollama',
] as const

/** One of the {@link LLM_PROVIDERS} */
export type LlmProviderName = (typeof LLM_PROVIDERS)[number]

/** How a provider's credential authenticates its calls */
export type LlmCredentialType = 'api-key' | 'oauth'

/** The configuration leaf that holds one provider's credential */
export interface LlmCredentialLeaf {
  type: LlmCredentialType
  /** Dotted path into the tree, for example `llm.openai.apiKey` */
  path: string
  /** The environment variable that sets it */
  env: string
  /** The credential from code or the environment, when one is set */
  value: string | undefined
}

/** Where each provider's credential lives in the tree; ollama needs none */
const CREDENTIAL_LEAVES: Readonly<Record<string, { type: LlmCredentialType; path: string }>> = {
  anthropic: { type: 'api-key', path: 'llm.anthropic.apiKey' },
  openai: { type: 'api-key', path: 'llm.openai.apiKey' },
  gemini: { type: 'api-key', path: 'llm.gemini.apiKey' },
  openrouter: { type: 'api-key', path: 'llm.openrouter.apiKey' },
  'claude-code': { type: 'oauth', path: 'llm.claudeCode.authToken' },
}

/** The error for a claude-code provider without its subscription token, naming the variable that sets it */
export function claudeCodeTokenMissing(env: string): string {
  return `The claude-code provider needs a subscription token. Run \`claude setup-token\` and set ${env}. It is for development on your own machine.`
}

/**
 * The leaf that holds a provider's credential, or null for a provider with none
 * (ollama) or one that is not known. Each provider has a credential of its own.
 */
export function llmCredentialLeaf(llm: LlmSection, provider: string): LlmCredentialLeaf | null {
  const entry = CREDENTIAL_LEAVES[provider]
  const leaf = entry ? leafByPath(entry.path) : undefined
  if (!entry || !leaf) return null
  const value = getPath({ llm }, entry.path)
  return {
    type: entry.type,
    path: entry.path,
    env: envNameFor(leaf) ?? '',
    value: typeof value === 'string' ? value : undefined,
  }
}
