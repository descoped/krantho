import type { ModelProfileInput } from './model-profile.js'

/** Supported LLM providers */
export type Provider = 'anthropic' | 'claude-code' | 'openai' | 'gemini' | 'openrouter' | 'ollama'

/** Wire format — Anthropic has its own, everyone else uses OpenAI-compatible */
export type WireFormat = 'anthropic' | 'openai'

/** Configuration for an LLM provider */
export interface LLMConfig {
  provider: Provider
  model?: string | undefined
  apiKey?: string | undefined
  /**
   * Claude subscription OAuth token (what `claude setup-token` prints). Read by
   * the `claude-code` provider only, which sends it as a bearer token and never
   * uses `apiKey`; every other provider ignores it. For development on the
   * developer's own machine, never for deployments.
   */
  authToken?: string | undefined
  baseUrl?: string | undefined
  /** Per-model request settings that override the defaults, by model id (`llm.profiles`) */
  profiles?: Readonly<Record<string, ModelProfileInput>> | undefined
}

/** Options for a completion request */
export interface LLMOptions {
  maxTokens?: number | undefined
  system?: string | undefined
  /** JSON Schema the reply must satisfy. Adapters with native structured output enforce it server-side. */
  jsonSchema?: Record<string, unknown> | undefined
  /** Reasoning depth on providers that expose it (Anthropic: output_config.effort). Ignored elsewhere. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined
}

/** Normalized completion result */
export interface CompletionResult {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  model: string
  finishReason: string
}

/**
 * A provider or model refused `jsonSchema`: it takes no schema-constrained reply. The adapter
 * reports `supportsJsonSchema: false` from then on, and `structuredComplete` sends the request
 * again with the schema in the prompt.
 */
export class StructuredOutputUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredOutputUnsupportedError'
  }
}

/** Provider-agnostic adapter interface */
export interface LLMAdapter {
  /** True when the provider enforces `jsonSchema` on the wire (and has not refused it); false means the caller embeds the schema in the prompt and parses. */
  readonly supportsJsonSchema: boolean
  complete(prompt: string, options?: LLMOptions): Promise<CompletionResult>
}
