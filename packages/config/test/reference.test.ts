import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { envNameFor, envReference, LEAVES, mechanicalEnvName } from '../src/index.js'

describe('envReference', () => {
  it('derives the mechanical name from the path', () => {
    expect(mechanicalEnvName('llm.openai.apiKey')).toBe('KRANTHO_LLM_OPENAI_API_KEY')
    expect(mechanicalEnvName('site.baseUrl')).toBe('KRANTHO_SITE_BASE_URL')
    expect(mechanicalEnvName('persistence.postgres.url')).toBe('KRANTHO_PERSISTENCE_POSTGRES_URL')
    expect(mechanicalEnvName('media.image.cache.maxEntries')).toBe(
      'KRANTHO_MEDIA_IMAGE_CACHE_MAX_ENTRIES',
    )
  })

  it('keeps the names deployments already set', () => {
    const names = new Map(LEAVES.map((leaf) => [leaf.path, envNameFor(leaf)]))
    expect(names.get('auth.mode')).toBe('KRANTHO_AUTH')
    expect(names.get('auth.token.secret')).toBe('KRANTHO_API_TOKEN')
    expect(names.get('auth.jwtSecret')).toBe('KRANTHO_JWT_SECRET')
    expect(names.get('auth.oidc.issuer')).toBe('OIDC_ISSUER_URL')
    expect(names.get('auth.oidc.clientSecret')).toBe('OIDC_CLIENT_SECRET')
    expect(names.get('media.maxFileSize')).toBe('KRANTHO_MEDIA_MAX_SIZE')
    expect(names.get('media.image.cache.ttiSec')).toBe('KRANTHO_IMAGE_CACHE_TTI_SECS')
    expect(names.get('tools.concurrency')).toBe('CLAUDE_CONCURRENCY')
  })

  it('names each provider credential after its own provider', () => {
    const names = new Map(LEAVES.map((leaf) => [leaf.path, envNameFor(leaf)]))
    expect(names.get('llm.anthropic.apiKey')).toBe('KRANTHO_LLM_ANTHROPIC_API_KEY')
    expect(names.get('llm.openai.apiKey')).toBe('KRANTHO_LLM_OPENAI_API_KEY')
    expect(names.get('llm.gemini.apiKey')).toBe('KRANTHO_LLM_GEMINI_API_KEY')
    expect(names.get('llm.openrouter.apiKey')).toBe('KRANTHO_LLM_OPENROUTER_API_KEY')
    expect(names.get('llm.claudeCode.authToken')).toBe('KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN')
    expect(names.get('assistant.provider')).toBe('KRANTHO_ASSISTANT_PROVIDER')
  })

  it('reads neither the old LLM key variable nor the Claude Code harness token', () => {
    const names = LEAVES.map((leaf) => envNameFor(leaf))
    expect(names).not.toContain('KRANTHO_LLM_API_KEY')
    expect(names).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
  })

  it('gives every leaf a unique variable and a description', () => {
    const seen = new Set<string>()
    for (const leaf of LEAVES) {
      expect(leaf.description, leaf.path).not.toBe('')
      const name = envNameFor(leaf)
      if (name === null) continue
      expect(seen.has(name), `${name} is declared twice`).toBe(false)
      seen.add(name)
    }
  })

  it('renders a row for every leaf', () => {
    const markdown = envReference()
    for (const leaf of LEAVES) {
      expect(markdown, leaf.path).toContain(`\`${leaf.path}\``)
    }
    expect(markdown).toContain('| `KRANTHO_MEDIA_MAX_SIZE` |')
    expect(markdown).toContain('| `KRANTHO_LLM_OPENAI_API_KEY` |')
    expect(markdown).toContain('code only')
  })

  it('matches the checked-in configuration reference', () => {
    const checkedIn = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'docs', 'configuration.md'),
      'utf8',
    )
    expect(checkedIn).toBe(envReference())
  })
})
