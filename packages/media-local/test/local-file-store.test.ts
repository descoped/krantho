import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IFileStore } from '@krantho/persistence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalFileStore, LocalFileStore } from '../src/index.js'

const BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

describe('LocalFileStore', () => {
  let root: string
  let dir: string
  let store: IFileStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'krantho-local-store-'))
    dir = join(root, 'uploads')
    store = createLocalFileStore({ dir, urlPrefix: '/uploads' })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('should describe itself as local disk at its directory', () => {
    expect(store).toBeInstanceOf(LocalFileStore)
    expect(store.label).toBe('Local disk')
    expect(store.location).toBe(dir)
  })

  it('should put a file, creating the directory, and return the prefixed url', async () => {
    const stored = await store.put('1-abc-photo.png', BYTES, 'image/png')
    expect(stored).toEqual({ key: '1-abc-photo.png', url: '/uploads/1-abc-photo.png' })
    expect(existsSync(join(dir, '1-abc-photo.png'))).toBe(true)
  })

  it('should get the bytes that were put', async () => {
    await store.put('1-abc-photo.png', BYTES, 'image/png')
    expect(await store.get('1-abc-photo.png')).toEqual(BYTES)
  })

  it('should return null when getting a missing key', async () => {
    expect(await store.get('missing.png')).toBeNull()
  })

  it('should copy a file to a new key', async () => {
    await store.put('1-abc-photo.png', BYTES, 'image/png')
    const copied = await store.copy('1-abc-photo.png', '2-def-photo.png', 'image/png')
    expect(copied).toEqual({ key: '2-def-photo.png', url: '/uploads/2-def-photo.png' })
    expect(await store.get('2-def-photo.png')).toEqual(BYTES)
    expect(await store.get('1-abc-photo.png')).toEqual(BYTES)
  })

  it('should fail to copy a missing key', async () => {
    await expect(store.copy('missing.png', 'copy.png', 'image/png')).rejects.toThrow()
  })

  it('should delete a file', async () => {
    await store.put('1-abc-photo.png', BYTES, 'image/png')
    await store.delete('1-abc-photo.png')
    expect(existsSync(join(dir, '1-abc-photo.png'))).toBe(false)
    expect(await store.get('1-abc-photo.png')).toBeNull()
  })

  it('should not fail when deleting a missing key', async () => {
    await expect(store.delete('missing.png')).resolves.toBeUndefined()
  })

  it.each(['a/b.png', '../escape.png', '..', '.hidden', 'Upper.png', '', 'a\\b.png'])(
    'should reject the key %j',
    async (key) => {
      await expect(store.put(key, BYTES, 'image/png')).rejects.toThrow('Invalid file key')
      await expect(store.get(key)).rejects.toThrow('Invalid file key')
      await expect(store.delete(key)).rejects.toThrow('Invalid file key')
      await expect(store.copy('ok.png', key, 'image/png')).rejects.toThrow('Invalid file key')
    },
  )
})
