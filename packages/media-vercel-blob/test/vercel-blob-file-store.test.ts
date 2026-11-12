import type { CopyBlobResult, GetBlobResult, PutBlobResult } from '@vercel/blob'
import { copy, del, get, put } from '@vercel/blob'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVercelBlobFileStore } from '../src/index.js'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  get: vi.fn(),
  copy: vi.fn(),
  del: vi.fn(),
}))

const TOKEN = 'vercel_blob_rw_test'
const BYTES = new Uint8Array([1, 2, 3, 4])
const WRITE_OPTIONS = {
  access: 'public',
  token: TOKEN,
  contentType: 'image/png',
  addRandomSuffix: false,
  allowOverwrite: false,
  cacheControlMaxAge: 31536000,
}

function blobUrl(key: string): string {
  return `https://store.public.blob.vercel-storage.com/${key}`
}

describe('createVercelBlobFileStore', () => {
  const store = createVercelBlobFileStore({ token: TOKEN })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should describe itself as Vercel Blob with no location', () => {
    expect(store.label).toBe('Vercel Blob')
    expect(store.location).toBeNull()
  })

  it('should refuse to build without a token', () => {
    expect(() => createVercelBlobFileStore({})).toThrow('media.vercelBlob.token')
  })

  it('should put with exactly the public, non-overwriting, one-year options', async () => {
    vi.mocked(put).mockResolvedValue({ url: blobUrl('a.png') } as PutBlobResult)
    const stored = await store.put('a.png', BYTES, 'image/png')

    expect(stored).toEqual({ key: 'a.png', url: blobUrl('a.png') })
    const [pathname, body, options] = vi.mocked(put).mock.calls[0] ?? []
    expect(pathname).toBe('a.png')
    expect(new Uint8Array(body as Buffer)).toEqual(BYTES)
    expect(options).toEqual(WRITE_OPTIONS)
  })

  it('should copy with the content type and the same write options', async () => {
    vi.mocked(copy).mockResolvedValue({ url: blobUrl('b.png') } as CopyBlobResult)
    const stored = await store.copy('a.png', 'b.png', 'image/png')

    expect(stored).toEqual({ key: 'b.png', url: blobUrl('b.png') })
    expect(copy).toHaveBeenCalledWith('a.png', 'b.png', WRITE_OPTIONS)
  })

  it('should delete with the token', async () => {
    vi.mocked(del).mockResolvedValue(undefined)
    await store.delete('a.png')
    expect(del).toHaveBeenCalledWith('a.png', { token: TOKEN })
  })

  it('should get the bytes of a public blob with the token', async () => {
    const result = {
      statusCode: 200,
      stream: new Response(BYTES).body,
    } as GetBlobResult
    vi.mocked(get).mockResolvedValue(result)

    expect(await store.get('a.png')).toEqual(BYTES)
    expect(get).toHaveBeenCalledWith('a.png', { access: 'public', token: TOKEN })
  })

  it('should return null when the blob does not exist', async () => {
    vi.mocked(get).mockResolvedValue(null)
    expect(await store.get('missing.png')).toBeNull()
  })

  it('should propagate SDK errors', async () => {
    vi.mocked(put).mockRejectedValue(new Error('blob exists'))
    await expect(store.put('a.png', BYTES, 'image/png')).rejects.toThrow('blob exists')
  })
})
