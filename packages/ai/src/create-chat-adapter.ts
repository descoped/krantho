import { AnthropicChatAdapter } from './anthropic-chat.js'
import type { ChatAdapter } from './chat-types.js'
import { OpenAIChatAdapter } from './openai-chat.js'
import { resolveProvider } from './provider-config.js'
import type { LLMConfig } from './types.js'

/**
 * Create a streaming, tool-using chat adapter from configuration.
 *
 * Same provider presets, credentials and model rules as `createLLMAdapter`:
 * Anthropic and `claude-code` use the Messages API, every other provider the
 * OpenAI-compatible Chat Completions API at its preset's `chatPath`. Plain
 * fetch() — no SDK.
 *
 * @example
 * ```ts
 * const chat = createChatAdapter({ provider: 'anthropic', apiKey: 'sk-ant-...' })
 * for await (const event of chat.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
 *   if (event.type === 'text') console.log(event.text)
 * }
 * ```
 */
export function createChatAdapter(config: LLMConfig): ChatAdapter {
  const { preset, baseUrl, model, profile, apiKey, authToken } = resolveProvider(config)

  if (preset.format === 'anthropic') {
    return new AnthropicChatAdapter(baseUrl, apiKey, model, authToken, config.provider)
  }
  return new OpenAIChatAdapter({
    provider: config.provider,
    baseUrl,
    apiKey,
    model,
    chatPath: preset.chatPath,
    maxTokensParam: preset.maxTokensParam,
    forbidTools: preset.forbidTools,
    openObjects: preset.openObjects,
    reasoningParam: preset.reasoningParam,
    profile,
  })
}
