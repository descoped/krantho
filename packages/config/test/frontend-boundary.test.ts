import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  envNameFor,
  LEAVES,
  redact,
  resolveConfig,
  SECRET_PATHS,
  toPublicConfig,
} from '../src/index.js'
import { getPath } from '../src/object-path.js'
import * as publicEntry from '../src/public.js'

const CWD = '/srv/site'
const MARKER = 'krantho-secret-marker-do-not-leak'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

/** Every secret leaf carrying the same marker value */
function configWithMarkedSecrets() {
  const env: Record<string, string> = { KRANTHO_AUTH: 'token' }
  for (const leaf of LEAVES) {
    if (!leaf.secret) continue
    const name = envNameFor(leaf)
    if (name) env[name] = MARKER
  }
  return resolveConfig({ site }, env, { cwd: CWD })
}

/** Every module the public subpath pulls in, following relative imports */
function publicModuleGraph(): Map<string, string> {
  const srcDir = join(import.meta.dirname, '..', 'src')
  const seen = new Map<string, string>()
  const pending = ['public.ts']
  while (pending.length > 0) {
    const file = pending.pop() as string
    if (seen.has(file)) continue
    const source = readFileSync(join(srcDir, file), 'utf8')
    seen.set(file, source)
    for (const match of source.matchAll(/from '\.\/([\w-]+)\.js'/g)) {
      pending.push(`${match[1]}.ts`)
    }
  }
  return seen
}

describe('the public subpath', () => {
  it('imports no Node built-in, directly or transitively', () => {
    for (const [file, source] of publicModuleGraph()) {
      expect(source, file).not.toMatch(/from 'node:/)
    }
  })

  it('exports the browser-safe projection', () => {
    expect(Object.keys(publicEntry).sort()).toEqual(['REDACTED', 'redact', 'toPublicConfig'])
  })
})

describe('the frontend boundary', () => {
  it('marks every leaf that holds a credential', () => {
    expect([...SECRET_PATHS].sort()).toEqual([
      'auth.jwtSecret',
      'auth.oidc.clientSecret',
      'auth.token.secret',
      'cache.cdn.gcp.accessToken',
      'llm.anthropic.apiKey',
      'llm.claudeCode.authToken',
      'llm.gemini.apiKey',
      'llm.openai.apiKey',
      'llm.openrouter.apiKey',
      'media.gcs.credentials',
      'media.s3.secretAccessKey',
      'media.vercelBlob.token',
      'persistence.postgres.url',
      'secrets.local.key',
    ])
  })

  it('actually loads the marker into every secret leaf', () => {
    const config = configWithMarkedSecrets()
    for (const path of SECRET_PATHS) {
      expect(getPath(config, path), path).toBe(MARKER)
    }
  })

  it('keeps every secret out of redact()', () => {
    const config = configWithMarkedSecrets()
    const dumped = JSON.stringify(redact(config))

    expect(dumped).not.toContain(MARKER)
    expect(dumped).toContain('[redacted]')
    expect(JSON.parse(dumped)).not.toHaveProperty('sources')
  })

  it('keeps redact() faithful about everything that is not a secret', () => {
    const config = configWithMarkedSecrets()
    const dumped = redact(config) as { site: { domain: string }; auth: { mode: string } }
    expect(dumped.site.domain).toBe('example.com')
    expect(dumped.auth.mode).toBe('token')
  })

  it('keeps every secret out of the public config', () => {
    const config = configWithMarkedSecrets()
    const dumped = JSON.stringify(toPublicConfig(config))

    expect(dumped).not.toContain(MARKER)
    expect(JSON.parse(dumped)).toEqual({
      site: {
        domain: 'example.com',
        name: 'Example',
        language: 'en',
        baseUrl: 'https://example.com',
        sameAs: [],
        supportedLocales: ['en'],
        defaultLocale: 'en',
      },
      seo: {
        limits: { metaDescription: { minChars: 120, maxChars: 155 }, title: { maxChars: 70 } },
        readers: ['google', 'bing'],
      },
      cache: { pages: 'none', shared: 'none' },
      features: { media: false, localization: false },
    })
  })

  it('tells a browser how pages are cached, from the code and the environment', () => {
    const fromCode = resolveConfig({ site, cache: { pages: 'next-isr' } }, {}, { cwd: CWD })
    expect(toPublicConfig(fromCode).cache).toEqual({ pages: 'next-isr', shared: 'none' })

    const fromEnv = resolveConfig(
      { site },
      { KRANTHO_CACHE_PAGES: 'next-isr', KRANTHO_CACHE_SHARED: 'database' },
      { cwd: CWD },
    )
    expect(toPublicConfig(fromEnv).cache).toEqual({ pages: 'next-isr', shared: 'database' })
  })

  it('keeps the CDN settings out of the public config', () => {
    const config = resolveConfig(
      { site, cache: { pages: 'cdn', cdn: { provider: 'cloudfront' } } },
      { KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID: 'E123' },
      { cwd: CWD },
    )
    expect(Object.keys(toPublicConfig(config).cache).sort()).toEqual(['pages', 'shared'])
    expect(JSON.stringify(toPublicConfig(config))).not.toContain('E123')
  })

  it('never lets a secret reach the public config through a new leaf', () => {
    const publicPaths = Object.entries(toPublicConfig(configWithMarkedSecrets()))
    const flattened = JSON.stringify(publicPaths)
    for (const path of SECRET_PATHS) {
      expect(flattened).not.toContain(path)
    }
  })
})
