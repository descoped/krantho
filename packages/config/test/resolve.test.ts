import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defineKranthoConfig,
  redact,
  resolveConfig,
  resolvePersistence,
  SECRET_PATHS,
  toPublicConfig,
} from '../src/index.js'

const CWD = '/srv/site'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

describe('resolveConfig', () => {
  it('fills every section from the shipped defaults', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })

    expect(config.persistence.provider).toBe('sqlite')
    expect(config.persistence.sqlite.busyTimeoutMs).toBe(10000)
    expect(config.persistence.sqlite.walRetries).toBe(10)
    expect(config.content.cache).toEqual({ enabled: true, ttlMs: 300000, maxEntries: 100 })
    expect(config.content.defaultStatus).toEqual({ filesystem: 'published' })
    expect(config.auth.mode).toBe('none')
    expect(config.auth.session.accessTtlSec).toBe(900)
    expect(config.auth.session.refreshTtlSec).toBe(2592000)
    expect(config.media.maxFileSize).toBe(10 * 1024 * 1024)
    expect(config.media.allowedMimeTypes).toContain('image/svg+xml')
    expect(config.media.image.quality).toEqual({ jpeg: 82, webp: 80, avif: 65, normalize: 85 })
    expect(config.llm.provider).toBe('anthropic')
    expect(config.llm.model).toBeUndefined()
    expect(config.seo.seedMode).toBe('seed')
    expect(config.seo.enrichment.meta).toEqual({
      minChars: 120,
      maxChars: 155,
      contentCap: 2000,
      maxTokens: 1024,
    })
    expect(config.tools.concurrency).toBe(5)
    expect(config.content.list.maxLimit).toBeUndefined()
  })

  it('derives locales from the primary language', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })
    expect(config.site.supportedLocales).toEqual(['en'])
    expect(config.site.defaultLocale).toBe('en')
  })

  it('derives the database path from the data directory and makes paths absolute', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })
    expect(config.paths.dataDir).toBe(join(CWD, '.krantho'))
    expect(config.persistence.sqlite.path).toBe(join(CWD, '.krantho', 'content.db'))
    expect(config.paths.seoGeneratedDir).toBe(join(CWD, 'content/seo/generated'))
    expect(config.persistence.filesystem.contentPath).toBe(join(CWD, 'content'))
  })

  it('derives the SEO output directory from a custom content directory', () => {
    const config = resolveConfig({ site, paths: { contentDir: 'site-content' } }, {}, { cwd: CWD })
    expect(config.paths.seoGeneratedDir).toBe(join(CWD, 'site-content', 'seo', 'generated'))
  })

  it('keeps an explicit SEO output directory', () => {
    const config = resolveConfig(
      { site, paths: { contentDir: 'site-content', seoGeneratedDir: 'out/seo' } },
      {},
      { cwd: CWD },
    )
    expect(config.paths.seoGeneratedDir).toBe(join(CWD, 'out', 'seo'))
  })

  it('leaves the SQLite sentinels alone', () => {
    // `:memory:` is an instruction to SQLite, not a location. Resolving it would
    // create a file called `:memory:` in the project root.
    const memory = resolveConfig(
      { site, persistence: { provider: 'sqlite', sqlite: { path: ':memory:' } } },
      {},
      { cwd: CWD },
    )
    expect(memory.persistence.sqlite.path).toBe(':memory:')

    const uri = resolveConfig(
      { site, persistence: { sqlite: { path: 'file:cache?mode=memory&cache=shared' } } },
      {},
      { cwd: CWD },
    )
    expect(uri.persistence.sqlite.path).toBe('file:cache?mode=memory&cache=shared')
  })

  it('leaves an absolute path the developer supplied alone', () => {
    const config = resolveConfig(
      { site, media: { local: { dir: '/var/data/uploads' } } },
      {},
      { cwd: CWD },
    )
    expect(config.media.local.dir).toBe('/var/data/uploads')
  })

  it('lets code override a default', () => {
    const config = resolveConfig(
      { site, content: { cache: { ttlMs: 1000 } }, llm: { provider: 'openai' } },
      {},
      { cwd: CWD },
    )
    expect(config.content.cache.ttlMs).toBe(1000)
    expect(config.content.cache.enabled).toBe(true)
    expect(config.llm.provider).toBe('openai')
  })

  it('lets the environment beat code', () => {
    const config = resolveConfig(
      { site, llm: { provider: 'openai', model: 'gpt-4o' } },
      { KRANTHO_LLM_PROVIDER: 'anthropic', KRANTHO_LLM_MODEL: 'claude-haiku-4-5' },
      { cwd: CWD },
    )
    expect(config.llm.provider).toBe('anthropic')
    expect(config.llm.model).toBe('claude-haiku-4-5')
  })

  it('keeps the environment variable names deployments already use', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_AUTH: 'token',
        KRANTHO_API_TOKEN: 'shared-secret',
        KRANTHO_TOKEN_ROLE: 'editor',
        KRANTHO_TOKEN_EMAIL: 'ops@example.com',
        KRANTHO_ADMIN_EMAILS: 'a@example.com, b@example.com',
        KRANTHO_SIGNUP: 'open',
        OIDC_ISSUER_URL: 'https://idp.example.com',
        OIDC_CLIENT_ID: 'client',
        OIDC_REDIRECT_URI: 'https://example.com/api/auth/callback',
        OIDC_POST_LOGOUT_URI: '/bye',
        KRANTHO_JWT_SECRET: 'jwt',
        KRANTHO_MEDIA_MAX_SIZE: '2048',
        KRANTHO_IMAGE_CACHE_MAX_ENTRIES: '10',
        KRANTHO_IMAGE_CACHE_MAX_MB: '20',
        KRANTHO_IMAGE_CACHE_TTI_SECS: '30',
        CLAUDE_CONCURRENCY: '9',
      },
      { cwd: CWD },
    )

    expect(config.auth.mode).toBe('token')
    expect(config.auth.token.secret).toBe('shared-secret')
    expect(config.auth.token.role).toBe('editor')
    expect(config.auth.token.email).toBe('ops@example.com')
    expect(config.auth.oidc.adminEmails).toEqual(['a@example.com', 'b@example.com'])
    expect(config.auth.oidc.signup).toBe('open')
    expect(config.auth.oidc.issuer).toBe('https://idp.example.com')
    expect(config.auth.oidc.postLogoutUri).toBe('/bye')
    expect(config.auth.jwtSecret).toBe('jwt')
    expect(config.media.maxFileSize).toBe(2048)
    expect(config.media.image.cache).toEqual({ maxEntries: 10, maxMb: 20, ttiSec: 30 })
    expect(config.tools.concurrency).toBe(9)
  })

  it('parses booleans and comma lists', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_CONTENT_WATCH: 'yes',
        KRANTHO_CONTENT_CACHE_ENABLED: 'off',
        KRANTHO_SITE_SUPPORTED_LOCALES: 'en, no , se',
      },
      { cwd: CWD },
    )
    expect(config.content.watch).toBe(true)
    expect(config.content.cache.enabled).toBe(false)
    expect(config.site.supportedLocales).toEqual(['en', 'no', 'se'])
  })

  it('treats an empty variable as unset', () => {
    const config = resolveConfig({ site }, { KRANTHO_LLM_PROVIDER: '' }, { cwd: CWD })
    expect(config.llm.provider).toBe('anthropic')
  })

  it('records where each leaf came from', () => {
    const config = resolveConfig(
      { site, llm: { provider: 'openai' } },
      { KRANTHO_LLM_OPENAI_API_KEY: 'sk-test' },
      { cwd: CWD },
    )
    expect(config.sources.get('llm.openai.apiKey')).toBe('env')
    expect(config.sources.get('llm.provider')).toBe('code')
    expect(config.sources.get('llm.model')).toBe('default')
    expect(config.sources.get('site.domain')).toBe('code')
  })

  it('accepts a config declared with defineKranthoConfig', () => {
    const declared = defineKranthoConfig({ site, seo: { configDir: './krantho.seo' } })
    const config = resolveConfig(declared, {}, { cwd: CWD })
    expect(config.seo.configDir).toBe(join(CWD, 'krantho.seo'))
  })
})

describe('page cache configuration', () => {
  it('ships a cache that renders every request and purges nothing', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })
    expect(config.cache).toEqual({
      pages: 'none',
      cdn: {
        provider: 'none',
        sMaxAgeSec: 86400,
        staleWhileRevalidateSec: 604800,
        tagHeader: 'x-krantho-cache-tag',
        cloudfront: {},
        gcp: {},
      },
      shared: 'none',
    })
  })

  it('reads every cache leaf from its mechanical variable', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_CACHE_PAGES: 'cdn',
        KRANTHO_CACHE_CDN_PROVIDER: 'gcp',
        KRANTHO_CACHE_CDN_S_MAX_AGE_SEC: '3600',
        KRANTHO_CACHE_CDN_STALE_WHILE_REVALIDATE_SEC: '60',
        KRANTHO_CACHE_CDN_TAG_HEADER: 'x-tags',
        KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID: 'E2EXAMPLE',
        KRANTHO_CACHE_CDN_GCP_PROJECT: 'my-project',
        KRANTHO_CACHE_CDN_GCP_URL_MAP: 'site-map',
        KRANTHO_CACHE_CDN_GCP_ACCESS_TOKEN: 'ya29.token',
        KRANTHO_CACHE_SHARED: 'database',
      },
      { cwd: CWD },
    )
    expect(config.cache).toEqual({
      pages: 'cdn',
      cdn: {
        provider: 'gcp',
        sMaxAgeSec: 3600,
        staleWhileRevalidateSec: 60,
        tagHeader: 'x-tags',
        cloudfront: { distributionId: 'E2EXAMPLE' },
        gcp: { project: 'my-project', urlMap: 'site-map', accessToken: 'ya29.token' },
      },
      shared: 'database',
    })
    expect(config.sources.get('cache.cdn.gcp.accessToken')).toBe('env')
  })

  it('lets the environment beat the cache set in code', () => {
    const config = resolveConfig(
      {
        site,
        cache: {
          pages: 'cdn',
          cdn: { provider: 'cloudfront', cloudfront: { distributionId: 'E1CODE' } },
        },
      },
      { KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID: 'E2ENV', KRANTHO_CACHE_PAGES: 'next-isr' },
      { cwd: CWD },
    )
    expect(config.cache.pages).toBe('next-isr')
    expect(config.cache.cdn.provider).toBe('cloudfront')
    expect(config.cache.cdn.cloudfront.distributionId).toBe('E2ENV')
    expect(config.cache.cdn.sMaxAgeSec).toBe(86400)
  })

  it('treats the Cloud CDN access token as a secret', () => {
    expect(SECRET_PATHS).toContain('cache.cdn.gcp.accessToken')
    const config = resolveConfig(
      {
        site,
        cache: {
          pages: 'cdn',
          cdn: { provider: 'gcp', gcp: { project: 'p', urlMap: 'm', accessToken: 'ya29.leak' } },
        },
      },
      {},
      { cwd: CWD },
    )
    expect(JSON.stringify(toPublicConfig(config))).not.toContain('ya29.leak')
    expect(JSON.stringify(redact(config))).not.toContain('ya29.leak')
  })
})

describe('assistant configuration', () => {
  it('ships the assistant off, open to editors and admins, with bounded requests', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })
    expect(config.assistant).toEqual({
      enabled: false,
      role: 'editor',
      confirmTtlSec: 600,
      limits: {
        maxTurns: 8,
        maxToolCalls: 16,
        maxTokens: 16000,
        maxRequestTokens: 200000,
        maxHistoryMessages: 40,
        maxInputChars: 60000,
        toolResultChars: 12000,
      },
    })
    expect(config.assistant.model).toBeUndefined()
  })

  it('reads the assistant leaves from their mechanical variables', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_ASSISTANT_ENABLED: 'true',
        KRANTHO_ASSISTANT_ROLE: 'editor',
        KRANTHO_ASSISTANT_MODEL: 'claude-sonnet',
        KRANTHO_ASSISTANT_CONFIRM_TTL_SEC: '120',
        KRANTHO_ASSISTANT_LIMITS_MAX_REQUEST_TOKENS: '50000',
      },
      { cwd: CWD },
    )
    expect(config.assistant.enabled).toBe(true)
    expect(config.assistant.role).toBe('editor')
    expect(config.assistant.model).toBe('claude-sonnet')
    expect(config.assistant.confirmTtlSec).toBe(120)
    expect(config.assistant.limits.maxRequestTokens).toBe(50000)
    expect(config.sources.get('assistant.enabled')).toBe('env')
  })

  it('rejects an unknown role and non-positive limits by variable', () => {
    expect(() =>
      resolveConfig({ site }, { KRANTHO_ASSISTANT_ROLE: 'owner' }, { cwd: CWD }),
    ).toThrow('KRANTHO_ASSISTANT_ROLE')
    expect(() =>
      resolveConfig({ site }, { KRANTHO_ASSISTANT_LIMITS_MAX_TURNS: '0' }, { cwd: CWD }),
    ).toThrow('KRANTHO_ASSISTANT_LIMITS_MAX_TURNS')
    expect(() =>
      resolveConfig({ site }, { KRANTHO_ASSISTANT_CONFIRM_TTL_SEC: '7200' }, { cwd: CWD }),
    ).toThrow('assistant.confirmTtlSec')
  })

  it('refuses the assistant on filesystem persistence', () => {
    expect(() =>
      resolveConfig(
        { site, assistant: { enabled: true }, persistence: { provider: 'filesystem' } },
        {},
        { cwd: CWD },
      ),
    ).toThrow('assistant.enabled: the assistant needs sqlite or postgres')
    expect(() =>
      resolveConfig({ site, persistence: { provider: 'filesystem' } }, {}, { cwd: CWD }),
    ).not.toThrow()
  })
})

describe('resolvePersistence', () => {
  it('fills the persistence section from the shipped defaults', () => {
    expect(resolvePersistence({}, { cwd: CWD })).toEqual({
      provider: 'sqlite',
      sqlite: {
        path: join(CWD, '.krantho', 'content.db'),
        busyTimeoutMs: 10000,
        walRetries: 10,
        walRetryDelayMs: 50,
      },
      postgres: {},
      filesystem: { contentPath: join(CWD, 'content') },
    })
  })

  it('resolves relative paths against the working directory by default', () => {
    const persistence = resolvePersistence({})
    expect(persistence.sqlite.path).toBe(join(process.cwd(), '.krantho', 'content.db'))
  })

  it('reads the persistence and path variables', () => {
    const persistence = resolvePersistence(
      {
        KRANTHO_PERSISTENCE_PROVIDER: 'postgres',
        KRANTHO_PERSISTENCE_POSTGRES_URL: 'postgres://db/krantho',
        KRANTHO_PERSISTENCE_POSTGRES_MAX_CONNECTIONS: '2',
        KRANTHO_PERSISTENCE_POSTGRES_PREPARE: 'false',
        KRANTHO_PATHS_DATA_DIR: 'var/data',
      },
      { cwd: CWD },
    )
    expect(persistence.provider).toBe('postgres')
    expect(persistence.postgres).toEqual({
      url: 'postgres://db/krantho',
      maxConnections: 2,
      prepare: false,
    })
    expect(persistence.sqlite.path).toBe(join(CWD, 'var', 'data', 'content.db'))
  })

  it('ignores variables outside paths and persistence', () => {
    const persistence = resolvePersistence(
      { KRANTHO_MEDIA_MAX_SIZE: 'not-a-number', KRANTHO_AUTH: 'token' },
      { cwd: CWD },
    )
    expect(persistence.provider).toBe('sqlite')
  })

  it('rejects a postgres provider without a URL', () => {
    expect(() =>
      resolvePersistence({ KRANTHO_PERSISTENCE_PROVIDER: 'postgres' }, { cwd: CWD }),
    ).toThrow('persistence.postgres.url')
  })

  it('names the variable when a value does not validate', () => {
    expect(() =>
      resolvePersistence({ KRANTHO_PERSISTENCE_PROVIDER: 'mysql' }, { cwd: CWD }),
    ).toThrow('KRANTHO_PERSISTENCE_PROVIDER')
    expect(() =>
      resolvePersistence({ KRANTHO_PERSISTENCE_SQLITE_WAL_RETRIES: 'many' }, { cwd: CWD }),
    ).toThrow('KRANTHO_PERSISTENCE_SQLITE_WAL_RETRIES')
  })
})
