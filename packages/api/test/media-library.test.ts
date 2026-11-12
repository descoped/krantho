import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaLibrary } from '../src/media-library.js'
import { MemoryFileStore, MemoryMediaMetadata, pngHeader } from './media-fakes.js'

const settings = { maxFileSize: 1024, allowedMimeTypes: ['image/png', 'image/svg+xml'] }

let metadata: MemoryMediaMetadata
let files: MemoryFileStore
let library: MediaLibrary

beforeEach(() => {
  metadata = new MemoryMediaMetadata()
  files = new MemoryFileStore()
  library = new MediaLibrary(metadata, files, settings)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function storageKeyOf(id: string): Promise<string | null> {
  return (await metadata.get(id))?.storageKey ?? null
}

describe('MediaLibrary upload', () => {
  it('should write the file under a flat key and record its url and dimensions', async () => {
    const item = await library.upload(pngHeader(40, 30), 'My Photo.PNG', 'image/png')
    const key = await storageKeyOf(item.id)

    expect(key).toMatch(/^\d+-[0-9a-f]{8}-my-photo\.png$/)
    expect(item.url).toBe(`https://cdn.test/${key}`)
    expect(item.filename).toBe('My Photo.PNG')
    expect({ width: item.width, height: item.height }).toEqual({ width: 40, height: 30 })
    expect(files.objects.has(key ?? '')).toBe(true)
    expect(item).not.toHaveProperty('storageKey')
  })

  it('should reject an unsupported MIME type', async () => {
    await expect(
      library.upload(pngHeader(1, 1), 'a.exe', 'application/x-msdownload'),
    ).rejects.toThrow('Unsupported file type')
    expect(files.objects.size).toBe(0)
  })

  it('should reject a file over the size limit', async () => {
    await expect(library.upload(new Uint8Array(2048), 'big.png', 'image/png')).rejects.toThrow(
      'File too large',
    )
    expect(files.objects.size).toBe(0)
  })

  it('should delete the written key when the insert throws', async () => {
    metadata.failInsert = true
    await expect(library.upload(pngHeader(1, 1), 'a.png', 'image/png')).rejects.toThrow(
      'insert failed',
    )
    expect(files.objects.size).toBe(0)
  })
})

describe('MediaLibrary update', () => {
  it('should keep key and url on rename', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    const key = await storageKeyOf(item.id)

    const renamed = await library.update(item.id, { filename: 'Renamed.png' })

    expect(renamed?.filename).toBe('Renamed.png')
    expect(renamed?.url).toBe(item.url)
    expect(await storageKeyOf(item.id)).toBe(key)
  })

  it('should return null for an unknown id', async () => {
    expect(await library.update('missing', { altText: 'x' })).toBeNull()
  })
})

describe('MediaLibrary replace', () => {
  it('should put a new key, append a version and delete the old key', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    await library.update(item.id, { crop: { x: 1, y: 1, width: 50, height: 50 } })
    const oldKey = await storageKeyOf(item.id)
    const versionsBefore = metadata.versions.get(item.id) ?? 0

    const replaced = await library.replace(item.id, pngHeader(8, 6), 'b.png', 'image/png')
    const newKey = await storageKeyOf(item.id)

    expect(replaced?.id).toBe(item.id)
    expect(newKey).not.toBe(oldKey)
    expect(replaced?.url).toBe(`https://cdn.test/${newKey}`)
    expect(replaced?.crop).toBeNull()
    expect(replaced?.width).toBe(8)
    expect(metadata.versions.get(item.id)).toBe(versionsBefore + 1)
    expect(files.objects.has(oldKey ?? '')).toBe(false)
    expect(files.objects.has(newKey ?? '')).toBe(true)
  })

  it('should validate the new file and leave the old one in place', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    await expect(
      library.replace(item.id, new Uint8Array(4096), 'b.png', 'image/png'),
    ).rejects.toThrow('File too large')
    expect(files.objects.size).toBe(1)
  })

  it('should return null for an unknown id', async () => {
    expect(await library.replace('missing', pngHeader(1, 1), 'b.png', 'image/png')).toBeNull()
  })
})

describe('MediaLibrary delete and duplicate', () => {
  it('should delete the key with the record', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    await library.delete(item.id)

    expect(await library.get(item.id)).toBeNull()
    expect(files.objects.size).toBe(0)
  })

  it('should copy the file to a new key on duplicate', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    await library.update(item.id, { altText: 'alt', tags: ['x'] })

    const copy = await library.duplicate(item.id)
    const copyKey = await storageKeyOf(copy?.id ?? '')

    expect(copy?.id).not.toBe(item.id)
    expect(copyKey).not.toBe(await storageKeyOf(item.id))
    expect(copy?.url).toBe(`https://cdn.test/${copyKey}`)
    expect(copy?.altText).toBe('alt')
    expect(copy?.tags).toEqual(['x'])
    expect(files.objects.size).toBe(2)
  })

  it('should report deleted and skipped ids on bulk delete', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    const result = await library.bulkDelete([item.id])
    expect(result).toEqual({ deleted: [item.id], skipped: [] })
  })
})

describe('MediaLibrary readOriginal', () => {
  it('should read stored bytes from the file store', async () => {
    const bytes = pngHeader(2, 2)
    const item = await library.upload(bytes, 'a.png', 'image/png')
    expect(await library.readOriginal(item.id)).toEqual(bytes)
  })

  it('should fetch a registered item from its url', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', fetchMock)
    const item = await library.register({
      filename: 'remote.png',
      url: 'https://images.example.com/remote.png',
      mimeType: 'image/png',
      size: 3,
      width: null,
      height: null,
    })

    expect(await library.readOriginal(item.id)).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledWith('https://images.example.com/remote.png')
  })

  it('should return null when a registered url answers an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404 })),
    )
    const item = await library.register({
      filename: 'remote.png',
      url: 'https://images.example.com/remote.png',
      mimeType: 'image/png',
      size: 3,
      width: null,
      height: null,
    })
    expect(await library.readOriginal(item.id)).toBeNull()
  })

  it('should return null for a deleted item', async () => {
    const item = await library.upload(pngHeader(1, 1), 'a.png', 'image/png')
    await library.delete(item.id)
    expect(await library.readOriginal(item.id)).toBeNull()
  })
})
