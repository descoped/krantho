/**
 * LLM adapter for the build-time pipeline, built from the resolved configuration.
 *
 * The credential is the configured provider's own: its API key from `llm.<provider>.apiKey`
 * (`KRANTHO_LLM_<PROVIDER>_API_KEY` in a deployment, or `krantho.config.ts` for a project that
 * keeps it in code). The `claude-code` provider is the exception: it runs on a Claude
 * subscription token (`llm.claudeCode.authToken`, `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`), a
 * development credential for the developer's own machine, and uses no API key. Ollama needs none.
 */

import type { LLMAdapter, Provider } from '@krantho/ai'
import { CLAUDE_CODE_PROVIDER, createLLMAdapter, PROVIDER_PRESETS } from '@krantho/ai'
import type { KranthoConfig } from '@krantho/config'
import { claudeCodeTokenMissing, llmCredentialLeaf } from '@krantho/config'

/**
 * Token cap for every enrichment call. It is the Anthropic adapter's own default,
 * passed explicitly so OpenAI-format providers — which send no cap when the caller
 * omits one — are bounded identically.
 */
export const ENRICH_MAX_TOKENS = 4096

function toProvider(value: string): Provider {
  if (value in PROVIDER_PRESETS) return value as Provider
  throw new Error(
    `Unknown LLM provider "${value}". Expected one of: ${Object.keys(PROVIDER_PRESETS).join(', ')}.`,
  )
}

/** The error that names the configured provider's own variable, or null when it has its credential */
function missingCredential(config: KranthoConfig): string | null {
  const { provider } = config.llm
  const leaf = llmCredentialLeaf(config.llm, provider)
  if (!leaf || leaf.value) return null
  if (provider === CLAUDE_CODE_PROVIDER) {
    return claudeCodeTokenMissing(leaf.env)
  }
  return `No LLM credential for ${provider}. Set ${leaf.env}, or put \`llm: { ${provider}: { apiKey } }\` in krantho.config.ts. To use a Claude subscription during development, set the provider to claude-code.`
}

/**
 * Build the adapter the enrichment scripts run against. The pipeline is a developer's tool,
 * so `claude-code` is not refused under `NODE_ENV=production` here, as it is in the API: whoever
 * runs it on a machine holds that machine's own subscription token.
 */
export function createLLM(config: KranthoConfig): LLMAdapter {
  const problem = missingCredential(config)
  if (problem) throw new Error(problem)

  const { provider, model, baseUrl } = config.llm
  const leaf = llmCredentialLeaf(config.llm, provider)
  return createLLMAdapter({
    provider: toProvider(provider),
    model,
    apiKey: leaf?.type === 'api-key' ? leaf.value : undefined,
    authToken: leaf?.type === 'oauth' ? leaf.value : undefined,
    baseUrl,
    profiles: config.llm.profiles,
  })
}
