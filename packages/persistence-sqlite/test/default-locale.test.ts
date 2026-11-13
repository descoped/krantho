import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteAdapter } from '../src/sqlite-adapter.js'

describe('SQLiteAdapter default locale', () => {
  let adapter: SQLiteAdapter

  beforeEach(() => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'nb' })
  })

  afterEach(() => {
    adapter.close()
  })

  async function save(title: string, publication?: 'publish'): Promise<void> {
    await adapter.writeContent({
      collection: 'pages',
      slug: 'home',
      fields: { title },
      body: '',
      ...(publication ? { publication } : {}),
    })
  }

  it('writes and reads a document that names no locale in the default locale', async () => {
    await save('Hjem')

    expect((await adapter.getContent('pages', 'home'))?.meta.locale).toBe('nb')
    expect((await adapter.getContent('pages', 'home', 'nb'))?.fields.title).toBe('Hjem')
    expect(await adapter.getContent('pages', 'home', 'en')).toBeNull()
  })

  it('reads the live version in the default locale', async () => {
    await save('Hjem', 'publish')

    expect((await adapter.getPublished('pages', 'home'))?.meta.locale).toBe('nb')
    expect(await adapter.getPublished('pages', 'home', 'en')).toBeNull()
  })

  it('lists, reads and restores versions in the default locale', async () => {
    await save('Første')
    await save('Andre')

    const versions = await adapter.listVersions('pages', 'home')
    expect(versions.map((v) => [v.version, v.locale])).toEqual([
      [2, 'nb'],
      [1, 'nb'],
    ])
    expect((await adapter.getVersion('pages', 'home', 1))?.fields.title).toBe('Første')

    expect(await adapter.restoreVersion('pages', 'home', 1)).toBe(true)
    const current = await adapter.getContent('pages', 'home')
    expect(current?.fields.title).toBe('Første')
    expect(current?.meta.version).toBe(3)
    expect(current?.meta.locale).toBe('nb')
  })

  it('deletes a document that names no locale in the default locale', async () => {
    await save('Hjem')
    await adapter.writeContent({
      collection: 'pages',
      slug: 'home',
      locale: 'en',
      fields: { title: 'Home' },
      body: '',
    })

    await adapter.deleteContent('pages', 'home')

    expect(await adapter.getContent('pages', 'home')).toBeNull()
    expect((await adapter.getContent('pages', 'home', 'en'))?.fields.title).toBe('Home')
  })

  it('imports a file that names no locale in the default locale', async () => {
    await adapter.upsertFromFile('pages', 'about', { title: 'Om' }, '', '', {}, 'content/about.md')

    expect((await adapter.getContent('pages', 'about'))?.meta.locale).toBe('nb')
    expect(await adapter.getContent('pages', 'about', 'en')).toBeNull()
  })
})
