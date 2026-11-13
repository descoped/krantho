import { randomUUID } from 'node:crypto'
import type { NewMediaRecord } from '@krantho/persistence'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresCheckpointAdapter } from '../src/postgres-checkpoints.js'
import { PostgresMediaAdapter } from '../src/postgres-media-adapter.js'
import { PostgresMediaFolderAdapter } from '../src/postgres-media-folder-adapter.js'

/**
 * The media metadata and folder adapters against a real Postgres (the
 * globalSetup testcontainer), in a database of this file's own. Same cases
 * as the SQLite suite, so the two adapters behave alike.
 */
let admin: Sql
let db: Sql
let media: PostgresMediaAdapter
let folders: PostgresMediaFolderAdapter
let clock = Date.parse('2026-01-01T00:00:00.000Z')
const database = `krantho_media_${randomUUID().replaceAll('-', '')}`

/** Advance the faked clock so every write gets a distinct timestamp */
function tick(): void {
  clock += 1000
  vi.setSystemTime(clock)
}

function record(id: string, overrides: Partial<NewMediaRecord> = {}): NewMediaRecord {
  return {
    id,
    filename: `${id}.png`,
    storageKey: `1767225600000-abcd1234-${id}.png`,
    url: `/uploads/${id}.png`,
    altText: '',
    mimeType: 'image/png',
    size: 1024,
    width: 640,
    height: 480,
    folder: null,
    tags: [],
    crop: null,
    hotspot: null,
    ...overrides,
  }
}

async function insert(id: string, overrides: Partial<NewMediaRecord> = {}): Promise<void> {
  tick()
  await media.insert(record(id, overrides))
}

async function versions(id: string): Promise<Array<{ version: number; is_current: boolean }>> {
  const rows = await db<Array<{ version: number; is_current: boolean }>>`
    SELECT version, is_current FROM media WHERE id = ${id} ORDER BY version`
  return rows.map((row) => ({ version: row.version, is_current: row.is_current }))
}

beforeAll(async () => {
  const connectionUri = process.env.KRANTHO_TEST_POSTGRES_URL
  if (!connectionUri) {
    throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
  }
  admin = postgres(connectionUri, { max: 1 })
  await admin.unsafe(`CREATE DATABASE ${database}`)
  const url = new URL(connectionUri)
  url.pathname = `/${database}`
  db = postgres(url.toString(), { max: 4, onnotice: () => {} })
  await runMigrations(db, postgresMigrations)
  media = new PostgresMediaAdapter(db)
  folders = new PostgresMediaFolderAdapter(db)
})

afterAll(async () => {
  await db?.end({ timeout: 5 })
  await admin?.unsafe(`DROP DATABASE IF EXISTS ${database}`)
  await admin?.end({ timeout: 5 })
})

beforeEach(async () => {
  await db`TRUNCATE TABLE media, media_folders`
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PostgresMediaAdapter', () => {
  it('inserts a record and stamps its creation time', async () => {
    tick()
    const inserted = await media.insert(record('a', { tags: ['hero'], altText: 'A' }))
    expect(inserted).toEqual({
      ...record('a', { tags: ['hero'], altText: 'A' }),
      createdAt: new Date(clock).toISOString(),
    })
    expect(await media.get('a')).toEqual(inserted)
  })

  it('keeps a null storage key for a registered URL', async () => {
    await insert('ext', { storageKey: null, url: 'https://cdn.example.com/x.png' })
    expect((await media.get('ext'))?.storageKey).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    expect(await media.get('missing')).toBeNull()
  })

  describe('list', () => {
    beforeEach(async () => {
      await insert('one', { filename: 'Sunset-Beach.png', folder: 'f1', tags: ['nature', 'beach'] })
      await insert('two', { filename: 'city_night.jpg', folder: 'f1', tags: ['city'] })
      await insert('three', { filename: 'sunrise.png', tags: ['nature'] })
    })

    it('lists current records newest first with the total', async () => {
      const result = await media.list()
      expect(result.items.map((item) => item.id)).toEqual(['three', 'two', 'one'])
      expect(result.total).toBe(3)
    })

    it('searches filenames case-insensitively', async () => {
      const result = await media.list({ search: 'SUN' })
      expect(result.items.map((item) => item.id)).toEqual(['three', 'one'])
    })

    it('treats LIKE wildcards in a search literally', async () => {
      expect((await media.list({ search: '_' })).items.map((item) => item.id)).toEqual(['two'])
      expect((await media.list({ search: '%' })).total).toBe(0)
    })

    it('filters by folder, and by the root folder', async () => {
      expect((await media.list({ folder: 'f1' })).items.map((item) => item.id)).toEqual([
        'two',
        'one',
      ])
      expect((await media.list({ folder: '' })).items.map((item) => item.id)).toEqual(['three'])
    })

    it('filters by tag', async () => {
      const result = await media.list({ tag: 'nature' })
      expect(result.items.map((item) => item.id)).toEqual(['three', 'one'])
      expect(result.total).toBe(2)
    })

    it('pages with limit and offset while the total counts every match', async () => {
      const page = await media.list({ limit: 1, offset: 1 })
      expect(page.items.map((item) => item.id)).toEqual(['two'])
      expect(page.total).toBe(3)
      expect((await media.list({ offset: 2 })).items.map((item) => item.id)).toEqual(['one'])
    })
  })

  describe('appendVersion', () => {
    it('appends a version with the changes and keeps one current row', async () => {
      await insert('a', { tags: ['x'] })
      tick()
      const crop = { x: 1, y: 2, width: 3, height: 4 }
      const updated = await media.appendVersion('a', { altText: 'Alt', crop, folder: 'f' })

      expect(updated).toMatchObject({ id: 'a', altText: 'Alt', crop, folder: 'f', tags: ['x'] })
      expect(updated?.createdAt).toBe(new Date(clock).toISOString())
      expect(await versions('a')).toEqual([
        { version: 1, is_current: false },
        { version: 2, is_current: true },
      ])

      await media.appendVersion('a', { crop: null, storageKey: 'new-key', url: '/uploads/new' })
      expect(await media.get('a')).toMatchObject({
        crop: null,
        storageKey: 'new-key',
        url: '/uploads/new',
        altText: 'Alt',
      })
      expect((await versions('a')).map((row) => row.version)).toEqual([1, 2, 3])
    })

    it('returns null when the id has no current record', async () => {
      expect(await media.appendVersion('missing', { altText: 'x' })).toBeNull()
    })
  })

  describe('markDeleted', () => {
    it('hides the record and returns the one it superseded', async () => {
      await insert('a', { tags: ['gone'], altText: 'Alt' })
      await insert('b')
      tick()
      const superseded = await media.markDeleted('a')

      expect(superseded).toMatchObject({ id: 'a', altText: 'Alt', tags: ['gone'] })
      expect(await media.get('a')).toBeNull()
      expect((await media.list()).items.map((item) => item.id)).toEqual(['b'])
      expect((await media.list()).total).toBe(1)
      expect(await media.listTags()).toEqual([])
      expect(await media.markDeleted('a')).toBeNull()
      expect(await media.appendVersion('a', { altText: 'back' })).toBeNull()
    })
  })

  it('counts current files, sums their size exactly and counts each folder', async () => {
    await insert('a', { size: 100, folder: 'f1' })
    await insert('b', { size: 250, folder: 'f1' })
    await insert('c', { size: 7, folder: 'f2' })
    await insert('d', { size: 3 })
    tick()
    await media.appendVersion('b', { size: 300 })
    tick()
    await media.markDeleted('c')
    expect(await media.stats()).toEqual({
      totalItems: 3,
      totalSize: 403,
      byFolder: { f1: 2 },
    })
  })

  it('lists distinct tags of current records, sorted', async () => {
    await insert('a', { tags: ['zebra', 'apple'] })
    await insert('b', { tags: ['apple', 'mango'] })
    await insert('c')
    expect(await media.listTags()).toEqual(['apple', 'mango', 'zebra'])
  })

  it('checkpoint restore brings back a record deleted after the checkpoint', async () => {
    await insert('a')
    tick()
    const checkpoints = new PostgresCheckpointAdapter(db)
    const checkpoint = await checkpoints.createCheckpoint('before')
    tick()
    await media.markDeleted('a')
    tick()
    await checkpoints.restoreCheckpoint(checkpoint.version)
    expect((await media.get('a'))?.id).toBe('a')
  })
})

describe('PostgresMediaFolderAdapter', () => {
  it('rejects a folder whose parent does not exist', async () => {
    await expect(folders.createFolder('Child', 'missing')).rejects.toThrow(
      'Parent folder "missing" not found',
    )
  })

  it('creates nested folders and lists them by name', async () => {
    const photos = await folders.createFolder('  Photos ')
    const archive = await folders.createFolder('Archive', photos.id)
    expect(photos).toMatchObject({ name: 'Photos', parentId: null })
    expect(archive.parentId).toBe(photos.id)
    expect((await folders.listFolders()).map((folder) => folder.name)).toEqual([
      'Archive',
      'Photos',
    ])
  })

  it('renames a folder, and returns null for an unknown one', async () => {
    const folder = await folders.createFolder('Old')
    const renamed = await folders.renameFolder(folder.id, ' New ')
    expect(renamed).toEqual({ ...folder, name: 'New' })
    expect((await folders.listFolders())[0]?.name).toBe('New')
    expect(await folders.renameFolder('missing', 'x')).toBeNull()
  })

  it('refuses to delete a folder with child folders', async () => {
    const parent = await folders.createFolder('Parent')
    await folders.createFolder('Child', parent.id)
    await expect(folders.deleteFolder(parent.id)).rejects.toThrow('has child folders')
  })

  it('refuses to delete a folder that holds media', async () => {
    const folder = await folders.createFolder('Full')
    await insert('a', { folder: folder.id })
    await expect(folders.deleteFolder(folder.id)).rejects.toThrow('contains media items')

    await media.markDeleted('a')
    await folders.deleteFolder(folder.id)
    expect(await folders.listFolders()).toEqual([])
  })

  it('deletes an empty folder, and errors on an unknown one', async () => {
    const folder = await folders.createFolder('Empty')
    await folders.deleteFolder(folder.id)
    expect(await folders.listFolders()).toEqual([])
    await expect(folders.deleteFolder(folder.id)).rejects.toThrow('not found')
  })
})
