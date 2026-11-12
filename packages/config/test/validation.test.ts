import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KranthoConfigError, resolveConfig } from '../src/index.js'

const CWD = '/srv/site'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    if (err instanceof KranthoConfigError) return [...err.issues]
    throw err
  }
  throw new Error('expected resolveConfig to throw')
}

describe('startup validation', () => {
  it('names the variable when an integer value does not parse', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_MEDIA_MAX_SIZE: 'abc' }, { cwd: CWD }),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('KRANTHO_MEDIA_MAX_SIZE')
    expect(issues[0]).toContain('media.maxFileSize')
    expect(issues[0]).toContain('expected an integer')
  })

  it('puts the variable name in the thrown message', () => {
    expect(() => resolveConfig({ site }, { KRANTHO_MEDIA_MAX_SIZE: 'abc' }, { cwd: CWD })).toThrow(
      /KRANTHO_MEDIA_MAX_SIZE/,
    )
  })

  it('reports every bad value at once', () => {
    const issues = issuesOf(() =>
      resolveConfig(
        { site },
        {
          KRANTHO_MEDIA_MAX_SIZE: 'abc',
          KRANTHO_IMAGE_CACHE_MAX_MB: 'plenty',
          KRANTHO_CONTENT_WATCH: 'maybe',
          CLAUDE_CONCURRENCY: 'lots',
        },
        { cwd: CWD },
      ),
    )
    expect(issues).toHaveLength(4)
    expect(issues.join('\n')).toContain('KRANTHO_IMAGE_CACHE_MAX_MB')
    expect(issues.join('\n')).toContain('KRANTHO_CONTENT_WATCH')
    expect(issues.join('\n')).toContain('CLAUDE_CONCURRENCY')
  })

  it('reports a missing site identity by path', () => {
    const issues = issuesOf(() => resolveConfig({}, {}, { cwd: CWD }))
    expect(issues.join('\n')).toContain('site.domain')
    expect(issues.join('\n')).toContain('site.baseUrl')
  })

  it('names the variable when an environment value fails schema validation', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_SITE_BASE_URL: 'example.com' }, { cwd: CWD }),
    )
    expect(issues[0]).toContain('KRANTHO_SITE_BASE_URL')
    expect(issues[0]).toContain('must be an absolute URL')
  })

  it('rejects an unknown key rather than ignoring it', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site, llm: { povider: 'anthropic' } } as never, {}, { cwd: CWD }),
    )
    expect(issues.join('\n')).toContain('povider')
  })

  it('enforces the rules that span two leaves', () => {
    expect(
      issuesOf(() =>
        resolveConfig(
          { site: { ...site, supportedLocales: ['en'], defaultLocale: 'no' } },
          {},
          { cwd: CWD },
        ),
      ).join('\n'),
    ).toContain('site.defaultLocale')

    expect(
      issuesOf(() => resolveConfig({ site }, { KRANTHO_AUTH: 'token' }, { cwd: CWD })).join('\n'),
    ).toContain('auth.token.secret')

    expect(
      issuesOf(() =>
        resolveConfig({ site, persistence: { provider: 'postgres' } }, {}, { cwd: CWD }),
      ).join('\n'),
    ).toContain('persistence.postgres.url')

    expect(
      issuesOf(() => resolveConfig({ site }, { KRANTHO_AUTH: 'oidc' }, { cwd: CWD })).join('\n'),
    ).toContain('auth.oidc.issuer')

    expect(
      issuesOf(() =>
        resolveConfig({ site }, { KRANTHO_AUTH_SESSION_SAME_SITE: 'none' }, { cwd: CWD }),
      ).join('\n'),
    ).toContain('auth.session.sameSite')

    expect(
      issuesOf(() =>
        resolveConfig(
          {
            site,
            auth: {
              mode: 'oidc',
              oidc: {
                issuer: 'https://vercel.com',
                clientId: 'cl_test',
                redirectUri: 'https://example.com/api/auth/callback',
                studioEntry: 'redirect',
              },
            },
          },
          {},
          { cwd: CWD },
        ),
      ).join('\n'),
    ).toContain('auth.jwtSecret')
  })

  it('accepts SameSite=None when the cookie is always Secure', () => {
    const config = resolveConfig(
      { site, auth: { session: { sameSite: 'none', secure: 'always' } } },
      {},
      { cwd: CWD },
    )
    expect(config.auth.session.sameSite).toBe('none')
  })

  it('rejects zero WAL attempts rather than silently skipping WAL mode', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_PERSISTENCE_SQLITE_WAL_RETRIES: '0' }, { cwd: CWD }),
    )
    expect(issues[0]).toContain('KRANTHO_PERSISTENCE_SQLITE_WAL_RETRIES')
  })

  it('reads a secret from the file a _FILE variable names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'krantho-config-'))
    const secretFile = join(dir, 'llm-key')
    writeFileSync(secretFile, 'sk-from-file\n')

    const config = resolveConfig(
      { site },
      { KRANTHO_LLM_OPENAI_API_KEY_FILE: secretFile },
      { cwd: CWD },
    )
    expect(config.llm.openai.apiKey).toBe('sk-from-file')
    expect(config.sources.get('llm.openai.apiKey')).toBe('env')
  })

  it('reads the OAuth token from KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN or its _FILE companion', () => {
    const fromVariable = resolveConfig(
      { site },
      { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN: 'oat-from-variable' },
      { cwd: CWD },
    )
    expect(fromVariable.llm.claudeCode.authToken).toBe('oat-from-variable')
    expect(fromVariable.sources.get('llm.claudeCode.authToken')).toBe('env')

    const dir = mkdtempSync(join(tmpdir(), 'krantho-config-'))
    const secretFile = join(dir, 'oauth-token')
    writeFileSync(secretFile, 'oat-from-file\n')
    const fromFile = resolveConfig(
      { site },
      { KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN_FILE: secretFile },
      { cwd: CWD },
    )
    expect(fromFile.llm.claudeCode.authToken).toBe('oat-from-file')
  })

  it('does not read the old variables: KRANTHO_LLM_API_KEY and the harness CLAUDE_CODE_OAUTH_TOKEN', () => {
    const config = resolveConfig(
      { site },
      { KRANTHO_LLM_API_KEY: 'sk-old', CLAUDE_CODE_OAUTH_TOKEN: 'oat-harness' },
      { cwd: CWD },
    )
    expect(config.llm.anthropic.apiKey).toBeUndefined()
    expect(config.llm.openai.apiKey).toBeUndefined()
    expect(config.llm.claudeCode.authToken).toBeUndefined()
    expect(JSON.stringify(config.llm)).not.toContain('sk-old')
    expect(JSON.stringify(config.llm)).not.toContain('oat-harness')
  })

  it('gives each provider its own credential from its own variable', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_LLM_ANTHROPIC_API_KEY: 'a',
        KRANTHO_LLM_OPENAI_API_KEY: 'o',
        KRANTHO_LLM_GEMINI_API_KEY: 'g',
        KRANTHO_LLM_OPENROUTER_API_KEY: 'r',
      },
      { cwd: CWD },
    )
    expect(config.llm.anthropic.apiKey).toBe('a')
    expect(config.llm.openai.apiKey).toBe('o')
    expect(config.llm.gemini.apiKey).toBe('g')
    expect(config.llm.openrouter.apiKey).toBe('r')
  })

  it('accepts a known assistant.provider from code or the environment', () => {
    const fromCode = resolveConfig({ site, assistant: { provider: 'openai' } }, {}, { cwd: CWD })
    expect(fromCode.assistant.provider).toBe('openai')

    const fromEnv = resolveConfig(
      { site },
      { KRANTHO_ASSISTANT_PROVIDER: 'claude-code' },
      { cwd: CWD },
    )
    expect(fromEnv.assistant.provider).toBe('claude-code')
    expect(resolveConfig({ site }, {}, { cwd: CWD }).assistant.provider).toBeUndefined()
  })

  it('rejects an unknown assistant.provider with the providers it could be', () => {
    const fromEnv = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_ASSISTANT_PROVIDER: 'gpt' }, { cwd: CWD }),
    )
    expect(fromEnv[0]).toContain('KRANTHO_ASSISTANT_PROVIDER (assistant.provider)')
    expect(fromEnv[0]).toContain('unknown provider "gpt"')
    expect(fromEnv[0]).toContain('anthropic, claude-code, openai, gemini, openrouter, ollama')

    const fromCode = issuesOf(() =>
      resolveConfig({ site, assistant: { provider: 'nope' as never } }, {}, { cwd: CWD }),
    )
    expect(fromCode[0]).toContain('assistant.provider: unknown provider "nope"')
  })

  it('reads the OIDC client secret from OIDC_CLIENT_SECRET or its _FILE companion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'krantho-config-'))
    const secretFile = join(dir, 'oidc-secret')
    writeFileSync(secretFile, 'secret-from-file\n')

    const fromVariable = resolveConfig({ site }, { OIDC_CLIENT_SECRET: 'shh' }, { cwd: CWD })
    expect(fromVariable.auth.oidc.clientSecret).toBe('shh')

    const fromFile = resolveConfig({ site }, { OIDC_CLIENT_SECRET_FILE: secretFile }, { cwd: CWD })
    expect(fromFile.auth.oidc.clientSecret).toBe('secret-from-file')

    const unset = resolveConfig({ site }, {}, { cwd: CWD })
    expect(unset.auth.oidc.clientSecret).toBeUndefined()
  })

  it('reports an unreadable secret file instead of starting without the secret', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_API_TOKEN_FILE: '/nope/missing' }, { cwd: CWD }),
    )
    expect(issues[0]).toContain('KRANTHO_API_TOKEN_FILE')
    expect(issues[0]).toContain('auth.token.secret')
  })

  it('prefers the variable over its _FILE companion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'krantho-config-'))
    const secretFile = join(dir, 'llm-key')
    writeFileSync(secretFile, 'from-file')

    const config = resolveConfig(
      { site },
      {
        KRANTHO_LLM_ANTHROPIC_API_KEY: 'from-variable',
        KRANTHO_LLM_ANTHROPIC_API_KEY_FILE: secretFile,
      },
      { cwd: CWD },
    )
    expect(config.llm.anthropic.apiKey).toBe('from-variable')
  })

  it('requires a CDN provider when pages are cached on the CDN', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_CACHE_PAGES: 'cdn' }, { cwd: CWD }),
    )
    expect(issues).toEqual(['cache.cdn.provider: required when cache.pages is "cdn"'])
  })

  it('requires the distribution for CloudFront', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_CACHE_CDN_PROVIDER: 'cloudfront' }, { cwd: CWD }),
    )
    expect(issues).toEqual([
      'cache.cdn.cloudfront.distributionId: required when cache.cdn.provider is "cloudfront"',
    ])
  })

  it('requires the project and the URL map for Cloud CDN', () => {
    const issues = issuesOf(() =>
      resolveConfig({ site }, { KRANTHO_CACHE_CDN_PROVIDER: 'gcp' }, { cwd: CWD }),
    )
    expect(issues).toEqual([
      'cache.cdn.gcp.project: required when cache.cdn.provider is "gcp"',
      'cache.cdn.gcp.urlMap: required when cache.cdn.provider is "gcp"',
    ])
  })

  it('accepts each provider once its settings are present', () => {
    const vercel = resolveConfig(
      { site, cache: { pages: 'cdn', cdn: { provider: 'vercel' } } },
      {},
      { cwd: CWD },
    )
    expect(vercel.cache.cdn.provider).toBe('vercel')

    const cloudfront = resolveConfig(
      { site },
      {
        KRANTHO_CACHE_PAGES: 'cdn',
        KRANTHO_CACHE_CDN_PROVIDER: 'cloudfront',
        KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID: 'E2EXAMPLE',
      },
      { cwd: CWD },
    )
    expect(cloudfront.cache.cdn.cloudfront.distributionId).toBe('E2EXAMPLE')

    const gcp = resolveConfig(
      { site },
      {
        KRANTHO_CACHE_PAGES: 'next-isr',
        KRANTHO_CACHE_CDN_PROVIDER: 'gcp',
        KRANTHO_CACHE_CDN_GCP_PROJECT: 'my-project',
        KRANTHO_CACHE_CDN_GCP_URL_MAP: 'site-map',
      },
      { cwd: CWD },
    )
    expect(gcp.cache.cdn.gcp).toEqual({ project: 'my-project', urlMap: 'site-map' })
  })

  it('rejects unknown cache strategies and providers by variable', () => {
    const issues = issuesOf(() =>
      resolveConfig(
        { site },
        {
          KRANTHO_CACHE_PAGES: 'varnish',
          KRANTHO_CACHE_CDN_PROVIDER: 'fastly',
          KRANTHO_CACHE_SHARED: 'redis',
        },
        { cwd: CWD },
      ),
    ).join('\n')
    expect(issues).toContain('KRANTHO_CACHE_PAGES (cache.pages)')
    expect(issues).toContain('KRANTHO_CACHE_CDN_PROVIDER (cache.cdn.provider)')
    expect(issues).toContain('KRANTHO_CACHE_SHARED (cache.shared)')
  })

  it('rejects a zero s-maxage and a tag header that is not a header name', () => {
    const issues = issuesOf(() =>
      resolveConfig(
        { site },
        { KRANTHO_CACHE_CDN_S_MAX_AGE_SEC: '0', KRANTHO_CACHE_CDN_TAG_HEADER: 'x tags' },
        { cwd: CWD },
      ),
    ).join('\n')
    expect(issues).toContain('KRANTHO_CACHE_CDN_S_MAX_AGE_SEC (cache.cdn.sMaxAgeSec)')
    expect(issues).toContain('KRANTHO_CACHE_CDN_TAG_HEADER (cache.cdn.tagHeader)')
  })
})
