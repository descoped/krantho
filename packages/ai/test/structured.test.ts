import { describe, expect, it } from 'vitest'
import { structuredComplete } from '../src/structured.js'
import type { CompletionResult, LLMAdapter, LLMOptions } from '../src/types.js'

interface MockCall {
  prompt: string
  options: LLMOptions | undefined
}

interface MockConfig {
  supportsJsonSchema?: boolean
  finishReason?: string
}

function mockAdapter(
  responseText: string,
  { supportsJsonSchema = false, finishReason = 'stop' }: MockConfig = {},
): LLMAdapter & { calls: MockCall[] } {
  const calls: MockCall[] = []
  return {
    supportsJsonSchema,
    calls,
    async complete(prompt: string, options?: LLMOptions): Promise<CompletionResult> {
      calls.push({ prompt, options })
      return {
        text: responseText,
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'test-model',
        finishReason,
      }
    },
  }
}

const schema = {
  type: 'object',
  properties: { description: { type: 'string' } },
  required: ['description'],
}

describe('structuredComplete without native structured output', () => {
  it('embeds the schema in the prompt and parses raw JSON', async () => {
    const llm = mockAdapter('{"description":"A test page"}')
    const result = await structuredComplete<{ description: string }>(llm, 'test', schema)
    expect(result.description).toBe('A test page')
    expect(llm.calls[0]?.prompt).toContain('"description"')
    expect(llm.calls[0]?.options?.jsonSchema).toBeUndefined()
  })

  it('strips markdown code fences', async () => {
    const llm = mockAdapter('```json\n{"description":"Fenced"}\n```')
    const result = await structuredComplete<{ description: string }>(llm, 'test', schema)
    expect(result.description).toBe('Fenced')
  })

  it('handles preamble text before JSON', async () => {
    const llm = mockAdapter('Here is the result:\n\n{"description":"With preamble"}')
    const result = await structuredComplete<{ description: string }>(llm, 'test', schema)
    expect(result.description).toBe('With preamble')
  })

  it('throws on invalid response', async () => {
    const llm = mockAdapter('Sorry, I cannot help with that.')
    await expect(structuredComplete(llm, 'test', schema)).rejects.toThrow('Failed to extract JSON')
  })
})

describe('structuredComplete with native structured output', () => {
  it('sends the prompt unwrapped, the schema as jsonSchema, and parses the reply directly', async () => {
    const llm = mockAdapter('{"description":"Native"}', { supportsJsonSchema: true })
    const result = await structuredComplete<{ description: string }>(llm, 'test', schema)
    expect(result.description).toBe('Native')
    expect(llm.calls[0]?.prompt).toBe('test')
    expect(llm.calls[0]?.options?.jsonSchema).toEqual({ ...schema, additionalProperties: false })
  })

  it('closes nested object schemas and leaves an explicit additionalProperties alone', async () => {
    const nested = {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        },
        open: { type: 'object', additionalProperties: true },
        choice: { anyOf: [{ type: 'object', properties: {} }, { type: 'null' }] },
      },
      required: ['pairs'],
    }
    const llm = mockAdapter('{"pairs":[]}', { supportsJsonSchema: true })
    await structuredComplete(llm, 'test', nested)
    expect(llm.calls[0]?.options?.jsonSchema).toEqual({
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { q: { type: 'string' } },
            required: ['q'],
            additionalProperties: false,
          },
        },
        open: { type: 'object', additionalProperties: true },
        choice: {
          anyOf: [
            { type: 'object', properties: {}, additionalProperties: false },
            { type: 'null' },
          ],
        },
      },
      required: ['pairs'],
      additionalProperties: false,
    })
  })

  it('does not treat object-valued default data as a schema node', async () => {
    const withDefault = {
      type: 'object',
      properties: { cfg: { type: 'object', default: { a: 1 } } },
    }
    const llm = mockAdapter('{"cfg":{}}', { supportsJsonSchema: true })
    await structuredComplete(llm, 'test', withDefault)
    expect(llm.calls[0]?.options?.jsonSchema).toEqual({
      type: 'object',
      properties: { cfg: { type: 'object', default: { a: 1 }, additionalProperties: false } },
      additionalProperties: false,
    })
  })

  it('names truncation when the reply stopped at max_tokens', async () => {
    const llm = mockAdapter('{"description":"cut', {
      supportsJsonSchema: true,
      finishReason: 'max_tokens',
    })
    await expect(structuredComplete(llm, 'test', schema)).rejects.toThrow('truncated at max_tokens')
  })

  it('names a malformed native reply', async () => {
    const llm = mockAdapter('not json', { supportsJsonSchema: true })
    await expect(structuredComplete(llm, 'test', schema)).rejects.toThrow(
      'Failed to parse structured LLM response',
    )
  })
})
