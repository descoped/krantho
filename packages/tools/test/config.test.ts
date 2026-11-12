import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConcurrency } from '../src/shared/concurrency'
import { loadConfig, parseRoot, withoutRoot } from '../src/shared/config'
import { createLLM, ENRICH_MAX_TOKENS } from '../src/shared/llm'
import { setToolPaths, toolPaths } from '../src/shared/tool-paths'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const SITE_ROOT = join(FIXTURES, 'site')
const KEYLESS_ROOT = join(FIXTURES, 'keyless')
const CLAUDE_CODE_ROOT = join(FIXTURES, 'claude-code')

describe('loadConfig', () => {
  it('resolves llm from the project krantho.config.ts', async () => {
    const config = await loadConfig(SITE_ROOT, {})

    expect(config.llm.provider).toBe('openai')
    expect(config.llm.model).toBe('gpt-4o-mini')
    expect(config.llm.openai.apiKey).toBe('sk-from-file')
    expect(config.sources.get('llm.openai.apiKey')).toBe('code')
  })

  it('lets the environment override the file', async () => {
    const config = await loadConfig(SITE_ROOT, {
      KRANTHO_LLM_OPENAI_API_KEY: 'sk-from-env',
      KRANTHO_LLM_MODEL: 'gpt-4o',
      CLAUDE_CONCURRENCY: '9',
    })

    expect(config.llm.openai.apiKey).toBe('sk-from-env')
    expect(config.llm.model).toBe('gpt-4o')
    expect(config.sources.get('llm.openai.apiKey')).toBe('env')
    expect(config.tools.concurrency).toBe(9)
  })

  it('resolves paths against the project root, not the working directory', async () => {
    const config = await loadConfig(SITE_ROOT, {})

    expect(config.paths.contentDir).toBe(join(SITE_ROOT, 'content'))
    expect(config.persistence.sqlite.path).toBe(join(SITE_ROOT, '.krantho', 'content.db'))
  })

  it('takes the defaults and the environment for the leaves a project leaves out', async () => {
    const config = await loadConfig(KEYLESS_ROOT, { KRANTHO_LLM_ANTHROPIC_API_KEY: 'sk-env-only' })

    expect(config.llm.provider).toBe('anthropic')
    expect(config.llm.model).toBeUndefined()
    expect(config.llm.anthropic.apiKey).toBe('sk-env-only')
    expect(config.tools.concurrency).toBe(5)
  })

  it('names the missing file when the root holds no krantho.config.ts', async () => {
    await expect(loadConfig(FIXTURES, {})).rejects.toThrow(/No krantho\.config\.ts in .*--root/s)
  })

  it('reports a bad environment value instead of silently ignoring it', async () => {
    await expect(loadConfig(SITE_ROOT, { CLAUDE_CONCURRENCY: 'abc' })).rejects.toThrow(
      /CLAUDE_CONCURRENCY/,
    )
  })
})

describe('parseRoot', () => {
  it('defaults to the working directory', () => {
    expect(parseRoot([], '/work')).toBe('/work')
    expect(parseRoot(['--apply'], '/work')).toBe('/work')
  })

  it('resolves a relative root against the working directory', () => {
    expect(parseRoot(['--root', 'site'], '/work')).toBe('/work/site')
  })

  it('keeps an absolute root', () => {
    expect(parseRoot(['--root', '/elsewhere/site'], '/work')).toBe('/elsewhere/site')
  })

  it('lets a later root override an earlier one', () => {
    expect(
      parseRoot(['--root', 'examples/site', 'config', 'show', '--root', '../other'], '/work'),
    ).toBe('/other')
  })

  it('ignores a root flag with no value', () => {
    expect(parseRoot(['--root', '--apply'], '/work')).toBe('/work')
  })
})

describe('withoutRoot', () => {
  it('removes the flag and its value so positionals keep their places', () => {
    expect(withoutRoot(['--root', 'site', 'config', 'show'])).toEqual(['config', 'show'])
    expect(withoutRoot(['validate', '--all'])).toEqual(['validate', '--all'])
  })
})

describe('resolveConcurrency', () => {
  it('prefers the flag over the resolved configuration', async () => {
    const config = await loadConfig(SITE_ROOT, {})

    expect(resolveConcurrency([], config)).toBe(3)
    expect(resolveConcurrency(['--concurrency', '7'], config)).toBe(7)
    expect(resolveConcurrency(['--concurrency', 'abc'], config)).toBe(3)
  })
})

describe('createLLM', () => {
  it('builds an adapter from the resolved configuration', async () => {
    const config = await loadConfig(SITE_ROOT, {})

    // The configured provider speaks the OpenAI format, which takes a schema-constrained reply
    expect(createLLM(config).supportsJsonSchema).toBe(true)
    expect(ENRICH_MAX_TOKENS).toBe(4096)
  })

  it("names the configured provider's own variable when no key is configured", async () => {
    const config = await loadConfig(KEYLESS_ROOT, {})

    expect(() => createLLM(config)).toThrow(
      /No LLM credential for anthropic.*KRANTHO_LLM_ANTHROPIC_API_KEY/s,
    )
  })

  it('names the claude-code provider and its own variable when the subscription token is missing', async () => {
    const config = await loadConfig(CLAUDE_CODE_ROOT, { KRANTHO_LLM_ANTHROPIC_API_KEY: 'sk-tools' })

    expect(() => createLLM(config)).toThrow(
      /claude-code provider.*claude setup-token.*KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN/s,
    )
  })

  it("does not lend the provider another provider's credential, and points to claude-code", async () => {
    const config = await loadConfig(KEYLESS_ROOT, {
      KRANTHO_LLM_OPENAI_API_KEY: 'sk-other',
      KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-tools',
    })

    expect(() => createLLM(config)).toThrow(/KRANTHO_LLM_ANTHROPIC_API_KEY.*claude-code/s)
  })

  it('no longer reads KRANTHO_LLM_API_KEY or the harness CLAUDE_CODE_OAUTH_TOKEN', async () => {
    const anthropic = await loadConfig(KEYLESS_ROOT, { KRANTHO_LLM_API_KEY: 'sk-old' })
    expect(() => createLLM(anthropic)).toThrow(/KRANTHO_LLM_ANTHROPIC_API_KEY/)

    const claudeCode = await loadConfig(CLAUDE_CODE_ROOT, {
      CLAUDE_CODE_OAUTH_TOKEN: 'oat-harness',
    })
    expect(() => createLLM(claudeCode)).toThrow(/KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN/)
  })

  describe('credentials per provider', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /** The headers a completion from `config` sends, against a stubbed endpoint */
    async function sentHeaders(root: string, env: Record<string, string>) {
      const reply = { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      const openaiReply = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }
      const fetchStub = vi.fn(async (url: string) =>
        Response.json({
          model: 'm',
          usage: { input_tokens: 1, output_tokens: 1, prompt_tokens: 1, completion_tokens: 1 },
          ...(url.endsWith('/v1/messages') ? reply : openaiReply),
        }),
      )
      vi.stubGlobal('fetch', fetchStub)
      await createLLM(await loadConfig(root, env)).complete('Hi')
      const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
      return init.headers as Record<string, string>
    }

    it('claude-code uses the subscription token and never the API key', async () => {
      const headers = await sentHeaders(CLAUDE_CODE_ROOT, {
        KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-tools',
        KRANTHO_LLM_ANTHROPIC_API_KEY: 'sk-tools',
      })
      expect(headers.authorization).toBe('Bearer oat-tools')
      expect(headers['x-api-key']).toBeUndefined()
    })

    it('anthropic uses the API key and ignores the subscription token', async () => {
      const headers = await sentHeaders(KEYLESS_ROOT, {
        KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-tools',
        KRANTHO_LLM_ANTHROPIC_API_KEY: 'sk-tools',
      })
      expect(headers['x-api-key']).toBe('sk-tools')
      expect(headers.authorization).toBeUndefined()
    })

    it('ignores the OAuth token for a non-anthropic provider', async () => {
      const headers = await sentHeaders(SITE_ROOT, {
        KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-tools',
        KRANTHO_LLM_ANTHROPIC_API_KEY: 'sk-other',
      })
      expect(headers.authorization).toBe('Bearer sk-from-file')
    })
  })
})

describe('setToolPaths', () => {
  it('points content and generated output at the project root', async () => {
    const config = await loadConfig(SITE_ROOT, {})
    setToolPaths(config)

    expect(toolPaths().pagesDir).toBe(join(SITE_ROOT, 'content', 'pages'))
    expect(toolPaths().seoDir).toBe(join(SITE_ROOT, 'content', 'seo'))
    expect(toolPaths().generatedDir).toBe(join(SITE_ROOT, 'content', 'seo', 'generated'))
  })
})
