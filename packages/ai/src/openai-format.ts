import { type ModelProfile, refusesReasoning, shapeRequest } from './model-profile.js'
import type { ProviderPreset } from './providers.js'
import {
  type CompletionResult,
  type LLMAdapter,
  type LLMOptions,
  StructuredOutputUnsupportedError,
} from './types.js'

/** Response shape from OpenAI Chat Completions API (and compatible providers) */
interface OpenAIResponse {
  id: string
  object: string
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string | null; refusal?: string | null }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIErrorResponse {
  error?: { message: string; type: string }
}

/**
 * The models (`baseUrl|model`) whose provider refused a schema-constrained reply. What a model
 * takes differs by model, not by provider, so a refusal is remembered for that model only. Like
 * the reasoning refusals in `model-profile.ts`, the memory lasts for the process.
 */
const refusedSchema = new Set<string>()

const MENTIONS_SCHEMA = /response_format|json_schema|structured output|schema/i
/** The model or endpoint takes no schema at all */
const MODEL_TAKES_NO_SCHEMA =
  /(does not|doesn't|do not|don't) support (the )?(response_format|json[_ ]schema|structured output)|(response_format|json[_ ]schema|structured outputs?) (is|are) (not supported|unsupported)|no endpoints found/i
/** The schema itself is at fault: the next schema may go through */
const BAD_SCHEMA = /invalid schema|schema is invalid/i

/**
 * Whether every object in the schema is closed and lists all its properties as required, which
 * is what OpenAI's strict mode takes; anything else is sent as guidance (`strict: false`).
 */
function strictCompatible(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(strictCompatible)
  if (typeof node !== 'object' || node === null) return true
  const schema = node as Record<string, unknown>
  if (schema['type'] === 'object') {
    const { properties, required } = schema
    const names =
      typeof properties === 'object' && properties !== null ? Object.keys(properties) : []
    const listed = Array.isArray(required) ? required : []
    if (schema['additionalProperties'] !== false) return false
    if (!names.every((name) => listed.includes(name))) return false
  }
  return Object.values(schema).every(strictCompatible)
}

/** What the completion adapter needs: the endpoint, the model, and how the model takes a request */
export interface OpenAIFormatOptions {
  baseUrl: string
  apiKey?: string | undefined
  model: string
  chatPath: string
  maxTokensParam: ProviderPreset['maxTokensParam']
  reasoningParam: ProviderPreset['reasoningParam']
  profile: ModelProfile
}

/**
 * OpenAI-compatible Chat Completions adapter.
 *
 * Uses plain fetch() — no SDK dependency.
 * Covers: OpenAI, Gemini, OpenRouter, Ollama.
 * Endpoint: POST {baseUrl}{chatPath} (the provider preset's chat completions path)
 * Auth: Authorization: Bearer header (omitted for Ollama)
 */
export class OpenAIFormatAdapter implements LLMAdapter {
  constructor(private readonly options: OpenAIFormatOptions) {}

  /** Providers take `response_format` with a JSON schema; one that refuses it for this model falls back */
  get supportsJsonSchema(): boolean {
    return !refusedSchema.has(this.key)
  }

  private get key(): string {
    return `${this.options.baseUrl}|${this.options.model}`
  }

  async complete(prompt: string, options?: LLMOptions): Promise<CompletionResult> {
    const messages: Array<{ role: string; content: string }> = []

    if (options?.system) {
      messages.push({ role: 'system', content: options.system })
    }
    messages.push({ role: 'user', content: prompt })

    const { profile, maxTokensParam, reasoningParam, baseUrl, model } = this.options
    const body: Record<string, unknown> = { model, messages }
    if (options?.jsonSchema !== undefined && this.supportsJsonSchema) {
      body['response_format'] = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: strictCompatible(options.jsonSchema),
          schema: options.jsonSchema,
        },
      }
    }
    shapeRequest(body, {
      profile,
      maxTokensParam,
      reasoningParam,
      key: `${baseUrl}|${model}`,
      maxTokens: options?.maxTokens,
    })

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.options.apiKey) {
      headers.authorization = `Bearer ${this.options.apiKey}`
    }

    const res = await fetch(`${this.options.baseUrl}${this.options.chatPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as OpenAIErrorResponse | null
      const msg = err?.error?.message ?? `LLM API error: ${String(res.status)}`
      if (options?.jsonSchema !== undefined && this.refusesSchema(res.status, msg)) {
        throw new StructuredOutputUnsupportedError(msg)
      }
      // A reasoning setting from an unchecked default, refused: once more, without it
      if (refusesReasoning(profile, `${baseUrl}|${model}`, res.status, msg)) {
        return this.complete(prompt, options)
      }
      throw new Error(msg)
    }

    const data = (await res.json()) as OpenAIResponse

    const choice = data.choices[0]
    if (!choice?.message.content) {
      const refusal = choice?.message.refusal
      throw new Error(refusal ? `LLM declined the request: ${refusal}` : 'LLM returned no content')
    }

    return {
      text: choice.message.content,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model: data.model,
      finishReason: choice.finish_reason ?? 'unknown',
    }
  }

  /**
   * Whether the provider's refusal is about the schema, so the request goes again with the schema
   * in the prompt. A model that says it takes no schema is remembered; a refusal of this one
   * schema (a keyword the provider's strict mode lacks) is not held against the model.
   */
  private refusesSchema(status: number, message: string): boolean {
    if (status !== 400 && status !== 404 && status !== 422) return false
    if (!MENTIONS_SCHEMA.test(message)) return false
    if (MODEL_TAKES_NO_SCHEMA.test(message) && !BAD_SCHEMA.test(message)) {
      refusedSchema.add(this.key)
    }
    return true
  }
}
