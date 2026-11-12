import { describe, expect, it } from 'vitest'
import type { KranthoConfigInput } from '../src/index.js'
import {
  KranthoConfigError,
  REDACTED,
  redact,
  resolveConfig,
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

function issuesOf(code: KranthoConfigInput, env: Record<string, string> = {}): string[] {
  try {
    resolveConfig({ site, ...code }, env, { cwd: CWD })
  } catch (err) {
    if (err instanceof KranthoConfigError) return [...err.issues]
    throw err
  }
  return []
}

describe('media provider', () => {
  it('leaves media off when no provider is set', () => {
    const config = resolveConfig({ site }, {}, { cwd: CWD })
    expect(config.media.provider).toBeUndefined()
    expect(toPublicConfig(config).features.media).toBe(false)
  })

  it('turns media on when a provider is set', () => {
    const config = resolveConfig({ site }, { KRANTHO_MEDIA_PROVIDER: 'local' }, { cwd: CWD })
    expect(config.media.provider).toBe('local')
    expect(toPublicConfig(config).features.media).toBe(true)
  })

  it('rejects an unknown provider', () => {
    const issues = issuesOf({}, { KRANTHO_MEDIA_PROVIDER: 'dropbox' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('KRANTHO_MEDIA_PROVIDER (media.provider)')
  })

  it('resolves the local store directory against the working directory', () => {
    const config = resolveConfig(
      { site, media: { provider: 'local' } },
      { KRANTHO_MEDIA_LOCAL_URL_PREFIX: '/files' },
      { cwd: CWD },
    )
    expect(config.media.local).toEqual({ dir: '/srv/site/public/uploads', urlPrefix: '/files' })
  })
})

describe('media startup validation', () => {
  it('requires a token for vercel-blob', () => {
    expect(issuesOf({ media: { provider: 'vercel-blob' } })).toEqual([
      'media.vercelBlob.token: required when media.provider is "vercel-blob" (KRANTHO_MEDIA_VERCEL_BLOB_TOKEN)',
    ])
  })

  it('requires a bucket and a region for s3', () => {
    expect(issuesOf({ media: { provider: 's3' } })).toEqual([
      'media.s3.bucket: required when media.provider is "s3" (KRANTHO_MEDIA_S3_BUCKET)',
      'media.s3.region: required when media.provider is "s3" (KRANTHO_MEDIA_S3_REGION)',
    ])
  })

  it('requires a public URL for s3 behind a custom endpoint', () => {
    const issues = issuesOf({
      media: {
        provider: 's3',
        s3: { bucket: 'media', region: 'auto', endpoint: 'https://acct.r2.cloudflarestorage.com' },
      },
    })
    expect(issues).toEqual([
      'media.s3.publicUrl: required when media.s3.endpoint is set (KRANTHO_MEDIA_S3_PUBLIC_URL)',
    ])
  })

  it('requires both halves of the s3 key pair', () => {
    const s3 = { bucket: 'media', region: 'eu-north-1' }
    expect(issuesOf({ media: { provider: 's3', s3: { ...s3, accessKeyId: 'AKIA' } } })).toEqual([
      'media.s3.secretAccessKey: required when media.s3.accessKeyId is set (KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY)',
    ])
    expect(
      issuesOf({ media: { provider: 's3', s3 } }, { KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY: 'shh' }),
    ).toEqual([
      'media.s3.accessKeyId: required when media.s3.secretAccessKey is set (KRANTHO_MEDIA_S3_ACCESS_KEY_ID)',
    ])
  })

  it('accepts s3 with no keys, leaving credentials to the default chain', () => {
    expect(issuesOf({ media: { provider: 's3', s3: { bucket: 'b', region: 'r' } } })).toEqual([])
  })

  it('requires a bucket for gcs', () => {
    expect(issuesOf({ media: { provider: 'gcs' } })).toEqual([
      'media.gcs.bucket: required when media.provider is "gcs" (KRANTHO_MEDIA_GCS_BUCKET)',
    ])
  })

  it('refuses media on filesystem persistence', () => {
    const issues = issuesOf({
      persistence: { provider: 'filesystem' },
      media: { provider: 'local' },
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^media\.provider: media needs sqlite or postgres/)
    expect(issues[0]).toContain('KRANTHO_MEDIA_PROVIDER')
  })

  it('checks no store settings while media is off', () => {
    expect(issuesOf({ persistence: { provider: 'filesystem' } })).toEqual([])
  })

  it('rejects a public URL that is not absolute', () => {
    const issues = issuesOf(
      { media: { provider: 'gcs', gcs: { bucket: 'media' } } },
      { KRANTHO_MEDIA_GCS_PUBLIC_URL: 'cdn.example.com' },
    )
    expect(issues).toEqual([
      'KRANTHO_MEDIA_GCS_PUBLIC_URL (media.gcs.publicUrl): must be an absolute URL',
    ])
  })
})

describe('derived media public URLs', () => {
  it('fills the AWS bucket URL when s3 has no endpoint', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_MEDIA_PROVIDER: 's3',
        KRANTHO_MEDIA_S3_BUCKET: 'media',
        KRANTHO_MEDIA_S3_REGION: 'eu-north-1',
      },
      { cwd: CWD },
    )
    expect(config.media.s3.publicUrl).toBe('https://media.s3.eu-north-1.amazonaws.com')
  })

  it('leaves the s3 public URL alone behind a custom endpoint', () => {
    const config = resolveConfig(
      {
        site,
        media: {
          s3: {
            bucket: 'media',
            region: 'auto',
            endpoint: 'https://acct.r2.cloudflarestorage.com',
            publicUrl: 'https://media.example.com',
          },
        },
      },
      {},
      { cwd: CWD },
    )
    expect(config.media.s3.publicUrl).toBe('https://media.example.com')
  })

  it('fills the GCS bucket URL', () => {
    const config = resolveConfig({ site }, { KRANTHO_MEDIA_GCS_BUCKET: 'media' }, { cwd: CWD })
    expect(config.media.gcs.publicUrl).toBe('https://storage.googleapis.com/media')
  })

  it('keeps a public URL the developer supplied', () => {
    const config = resolveConfig(
      { site, media: { gcs: { bucket: 'media', publicUrl: 'https://cdn.example.com' } } },
      {},
      { cwd: CWD },
    )
    expect(config.media.gcs.publicUrl).toBe('https://cdn.example.com')
  })
})

describe('media secrets', () => {
  const secretLeaves = [
    'media.vercelBlob.token',
    'media.s3.secretAccessKey',
    'media.gcs.credentials',
  ]

  it('marks the store credentials as secret', () => {
    for (const path of secretLeaves) expect(SECRET_PATHS).toContain(path)
  })

  it('reads the store credentials from the environment and redacts them', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_MEDIA_VERCEL_BLOB_TOKEN: 'blob-token',
        KRANTHO_MEDIA_S3_ACCESS_KEY_ID: 'AKIA',
        KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY: 's3-secret',
        KRANTHO_MEDIA_GCS_CREDENTIALS: '{"client_email":"x"}',
      },
      { cwd: CWD },
    )
    expect(config.media.vercelBlob.token).toBe('blob-token')
    expect(config.media.s3.secretAccessKey).toBe('s3-secret')
    expect(config.media.gcs.credentials).toBe('{"client_email":"x"}')

    const media = redact(config).media as {
      vercelBlob: { token: string }
      s3: { accessKeyId: string; secretAccessKey: string }
      gcs: { credentials: string }
    }
    expect(media.vercelBlob.token).toBe(REDACTED)
    expect(media.s3.secretAccessKey).toBe(REDACTED)
    expect(media.gcs.credentials).toBe(REDACTED)
    expect(media.s3.accessKeyId).toBe('AKIA')
  })

  it('keeps every media setting out of the public config', () => {
    const config = resolveConfig(
      { site },
      {
        KRANTHO_MEDIA_PROVIDER: 's3',
        KRANTHO_MEDIA_S3_BUCKET: 'private-bucket-name',
        KRANTHO_MEDIA_S3_REGION: 'eu-north-1',
        KRANTHO_MEDIA_S3_ACCESS_KEY_ID: 'AKIA-marker',
        KRANTHO_MEDIA_S3_SECRET_ACCESS_KEY: 's3-secret-marker',
      },
      { cwd: CWD },
    )
    const dumped = JSON.stringify(toPublicConfig(config))
    expect(dumped).not.toContain('private-bucket-name')
    expect(dumped).not.toContain('AKIA-marker')
    expect(dumped).not.toContain('s3-secret-marker')
    expect(toPublicConfig(config).features.media).toBe(true)
  })
})
