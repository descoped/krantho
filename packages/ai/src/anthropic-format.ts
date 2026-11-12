import { anthropicHeaders } from './anthropic-headers.js'
import type { CompletionResult, LLMAdapter, LLMOptions } from './types.js'

/** Response shape from Anthropic Messages API */
interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{ type: 'text'; text: string } | { type: string }>
  model: string
  stop_reason: string | null
  stop_details?: { type: string; category: string | null; explanation?: string } | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

interface AnthropicErrorResponse {
  type: 'error'
  error: { type: string; message: string }
}

/**
 * Anthropic Messages API adapter.
 *
 * Uses plain fetch() — no SDK dependency.
 * Endpoint: POST {baseUrl}/v1/messages
 * Auth: `Authorization: Bearer` plus the OAuth beta header when an OAuth token
 * is given (the `claude-code` provider), otherwise the x-api-key header
 */
export class AnthropicFormatAdapter implements LLMAdapter {
  readonly supportsJsonSchema = true

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly authToken?: string | undefined,
  ) {}

  async complete(prompt: string, options?: LLMOptions): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: [{ role: 'user', content: prompt }],
    }

    if (options?.system !== undefined) {
      body.system = options.system
    }
    const outputConfig: Record<string, unknown> = {}
    if (options?.jsonSchema !== undefined) {
      outputConfig.format = { type: 'json_schema', schema: options.jsonSchema }
    }
    if (options?.effort !== undefined) {
      outputConfig.effort = options.effort
    }
    if (Object.keys(outputConfig).length > 0) {
      body.output_config = outputConfig
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(this.apiKey, this.authToken),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as AnthropicErrorResponse | null
      const msg = err?.error?.message ?? `Anthropic API error: ${String(res.status)}`
      throw new Error(msg)
    }

    const data = (await res.json()) as AnthropicResponse

    if (data.stop_reason === 'refusal') {
      const category = data.stop_details?.category ?? 'unspecified'
      throw new Error(`Anthropic declined the request (refusal: ${category})`)
    }

    const textBlock = data.content.find(
      (b): b is { type: 'text'; text: string } => b.type === 'text',
    )
    if (!textBlock) {
      throw new Error('Anthropic returned no text content')
    }

    return {
      text: textBlock.text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
      model: data.model,
      finishReason: data.stop_reason ?? 'unknown',
    }
  }
}
