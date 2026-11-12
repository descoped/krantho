import type { KranthoConfigInput, MediaSection } from '@krantho/config'
import { resolveConfig } from '@krantho/config'
import { afterEach, describe, expect, it, vi } from 'vitest'

const site = {
  domain: 'localhost',
  name: 'Stores',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

function mediaSection(media: KranthoConfigInput['media']): MediaSection {
  return resolveConfig({ site, media }, {}).media
}

const cases: ReadonlyArray<[string, KranthoConfigInput['media'], string]> = [
  ['local', { provider: 'local', local: { dir: '/tmp/krantho-stores' } }, 'Local disk'],
  [
    'vercel-blob',
    { provider: 'vercel-blob', vercelBlob: { token: 'vercel_blob_rw_x' } },
    'Vercel Blob',
  ],
  ['s3', { provider: 's3', s3: { bucket: 'media', region: 'eu-north-1' } }, 'S3'],
  ['gcs', { provider: 'gcs', gcs: { bucket: 'media' } }, 'Google Cloud Storage'],
]

afterEach(() => {
  vi.doUnmock('@krantho/media-s3')
  vi.resetModules()
})

describe('createFileStore', () => {
  it.each(cases)('should load the %s store', async (_provider, media, label) => {
    const { createFileStore } = await import('../src/file-store.js')
    const store = await createFileStore(mediaSection(media))

    expect(store.label).toBe(label)
  })

  it('should name the package that could not be loaded', async () => {
    vi.doMock('@krantho/media-s3', () => {
      throw new Error('Cannot find package')
    })
    const { createFileStore } = await import('../src/file-store.js')
    const media = mediaSection({ provider: 's3', s3: { bucket: 'media', region: 'eu-north-1' } })

    await expect(createFileStore(media)).rejects.toThrow(
      'media.provider is "s3", but @krantho/media-s3 could not be loaded. Add it to the dependencies of the app that runs krantho.',
    )
  })

  it('should refuse an unset provider', async () => {
    const { createFileStore } = await import('../src/file-store.js')
    await expect(createFileStore(mediaSection({}))).rejects.toThrow('media.provider is not set')
  })
})
