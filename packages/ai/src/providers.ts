import type { Provider, WireFormat } from './types.js'

/** Default configuration for each provider */
export interface ProviderPreset {
  /** What a person calls it: the product, not the API */
  label: string
  /** Who makes it, for a line under the label */
  vendor: string
  format: WireFormat
  baseUrl: string
  defaultModel: string
  /** Path of the OpenAI-compatible chat completions endpoint under baseUrl */
  chatPath: string
  /** The field that caps output tokens on this provider */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  /**
   * How a request forbids tool calls (the last allowed turn): `tool_choice: 'none'`, or by
   * leaving the tools out where the provider does not read `tool_choice` (Ollama).
   */
  forbidTools: 'tool_choice' | 'omit_tools'
  /**
   * How a parameter that is an object without named properties is declared: as it is, or
   * as a JSON string the adapter decodes (Gemini has rejected an OBJECT with no properties).
   */
  openObjects: 'native' | 'json_string'
  /**
   * How a reasoning effort is sent: the top-level `reasoning_effort` (OpenAI, Gemini and Ollama's
   * compatible endpoints), or OpenRouter's `reasoning: { effort }`. Unset where the wire has
   * no such setting: Anthropic thinks only when asked to, and a request that does not ask is
   * the one that does not.
   */
  reasoningParam?: 'reasoning_effort' | 'reasoning' | undefined
}

/**
 * The one model the `claude-code` provider runs. The subscription is for development on the
 * developer's own machine, so the model is pinned to Haiku: configuring another model is an
 * error, never a silent downgrade.
 */
export const CLAUDE_CODE_MODEL = 'claude-haiku-4-5-20251001'

/** The provider that runs on the Claude subscription token */
export const CLAUDE_CODE_PROVIDER = 'claude-code'

/**
 * Default models per provider. Anthropic and OpenRouter default to Haiku 4.5: enrichment writes
 * short SEO strings, so the cheapest current model is the shipped default. Sites choose a larger
 * model in LLM settings or via `llm.model`. IDs are point-in-time and may need updating.
 * The Anthropic-format providers' `chatPath` names the Messages endpoint; only the OpenAI-format adapters read it.
 */
export const PROVIDER_PRESETS: Record<Provider, ProviderPreset> = {
  anthropic: {
    label: 'Claude',
    vendor: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    chatPath: '/v1/messages',
    maxTokensParam: 'max_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
  },
  'claude-code': {
    label: 'Claude Code',
    vendor: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: CLAUDE_CODE_MODEL,
    chatPath: '/v1/messages',
    maxTokensParam: 'max_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
  },
  openai: {
    label: 'ChatGPT',
    vendor: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o',
    chatPath: '/v1/chat/completions',
    maxTokensParam: 'max_completion_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
    reasoningParam: 'reasoning_effort',
  },
  gemini: {
    label: 'Gemini',
    vendor: 'Google',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    chatPath: '/chat/completions',
    maxTokensParam: 'max_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'json_string',
    reasoningParam: 'reasoning_effort',
  },
  openrouter: {
    label: 'OpenRouter',
    vendor: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api',
    defaultModel: 'anthropic/claude-haiku-4.5',
    chatPath: '/v1/chat/completions',
    maxTokensParam: 'max_tokens',
    forbidTools: 'tool_choice',
    openObjects: 'native',
    reasoningParam: 'reasoning',
  },
  ollama: {
    label: 'Ollama',
    vendor: 'Ollama (on your own computer)',
    format: 'openai',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    chatPath: '/v1/chat/completions',
    maxTokensParam: 'max_tokens',
    forbidTools: 'omit_tools',
    openObjects: 'native',
    reasoningParam: 'reasoning_effort',
  },
}
