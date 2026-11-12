import { AnthropicFormatAdapter } from './anthropic-format.js'
import { OpenAIFormatAdapter } from './openai-format.js'
import { resolveProvider } from './provider-config.js'
import type { LLMAdapter, LLMConfig } from './types.js'

/**
 * Create an LLM adapter from configuration.
 *
 * Selects the correct wire format (Anthropic or OpenAI-compatible)
 * based on the provider. The `claude-code` provider needs `authToken` and runs
 * its pinned model only; every other provider uses `apiKey`.
 * Uses plain fetch() — no SDK dependencies.
 *
 * @example
 * ```ts
 * const llm = createLLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant-...' })
 * const result = await llm.complete('Hello')
 * console.log(result.text)
 * ```
 */
export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  const { preset, baseUrl, model, profile, apiKey, authToken } = resolveProvider(config)

  if (preset.format === 'anthropic') {
    return new AnthropicFormatAdapter(baseUrl, apiKey, model, authToken)
  }
  return new OpenAIFormatAdapter({
    baseUrl,
    apiKey,
    model,
    chatPath: preset.chatPath,
    maxTokensParam: preset.maxTokensParam,
    reasoningParam: preset.reasoningParam,
    profile,
  })
}
