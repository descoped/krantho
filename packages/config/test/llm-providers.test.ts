import { describe, expect, it } from 'vitest'
import { LLM_PROVIDERS, llmCredentialLeaf, resolveConfig } from '../src/index.js'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

describe('llmCredentialLeaf', () => {
  const config = resolveConfig(
    { site },
    {
      KRANTHO_LLM_OPENAI_API_KEY: 'sk-openai',
      KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-token',
    },
    { cwd: '/srv/site' },
  )

  it('finds each provider its own leaf, variable and value', () => {
    expect(llmCredentialLeaf(config.llm, 'openai')).toEqual({
      type: 'api-key',
      path: 'llm.openai.apiKey',
      env: 'KRANTHO_LLM_OPENAI_API_KEY',
      value: 'sk-openai',
    })
    expect(llmCredentialLeaf(config.llm, 'claude-code')).toEqual({
      type: 'oauth',
      path: 'llm.claudeCode.authToken',
      env: 'KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN',
      value: 'oat-token',
    })
  })

  it("does not lend one provider's credential to another", () => {
    expect(llmCredentialLeaf(config.llm, 'anthropic')?.value).toBeUndefined()
    expect(llmCredentialLeaf(config.llm, 'gemini')?.value).toBeUndefined()
  })

  it('has no leaf for ollama or an unknown provider', () => {
    expect(llmCredentialLeaf(config.llm, 'ollama')).toBeNull()
    expect(llmCredentialLeaf(config.llm, 'mystery')).toBeNull()
  })

  it('covers every provider but ollama', () => {
    const withLeaf = LLM_PROVIDERS.filter((name) => llmCredentialLeaf(config.llm, name) !== null)
    expect(withLeaf).toEqual(LLM_PROVIDERS.filter((name) => name !== 'ollama'))
  })
})
