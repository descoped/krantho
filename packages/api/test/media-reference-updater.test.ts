import { SQLiteAdapter } from '@krantho/persistence-sqlite'
import { defineCollection, defineConfig } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { updateMediaReferences } from '../src/media-reference-updater.js'

const contentConfig = defineConfig({
  collections: {
    pages: defineCollection({
      name: 'pages',
      source: 'database',
      schema: z.object({ title: z.string(), hero: z.string().optional() }),
    }),
  },
})

const contract = {
  id: 'page',
  revision: 'r1',
  label: 'Page',
  fields: { type: 'object' },
  metadata: {},
  body: 'optional' as const,
  sections: [],
}

describe('updateMediaReferences', () => {
  let adapter: SQLiteAdapter

  beforeEach(async () => {
    adapter = new SQLiteAdapter(':memory:', { defaultLocale: 'en' })
    await adapter.writeContent({
      collection: 'pages',
      slug: 'about',
      fields: { title: 'About', hero: '/media/old.png' },
      body: '![Team](/media/old.png)',
      contract,
      metadata: { sharing: { image: '/media/old.png', title: 'Share' } },
      defaults: [
        {
          collection: 'globals',
          slug: 'defaults',
          locale: 'en',
          version: 1,
          paths: ['metadata.sharing'],
          values: {},
        },
      ],
      publication: 'publish',
      expectedVersion: 0,
    })
  })

  afterEach(() => {
    adapter.close()
  })

  it('replaces the URL in fields, metadata and body, and keeps the contract and provenance', async () => {
    const before = await adapter.getContent('pages', 'about')
    expect(
      await updateMediaReferences('/media/old.png', '/media/new.png', adapter, contentConfig),
    ).toEqual({ updated: 1, failed: [] })
    const after = await adapter.getContent('pages', 'about')
    expect(after?.fields['hero']).toBe('/media/new.png')
    expect(after?.body).toBe('![Team](/media/new.png)')
    expect(after?.metadata).toEqual({ sharing: { image: '/media/new.png', title: 'Share' } })
    expect(after?.contract).toEqual(before?.contract)
    expect(after?.defaults).toEqual(before?.defaults)
    // In step with its page before, so the new URL goes live
    expect(after?.meta).toMatchObject({ version: 2, liveVersion: 2, changedBy: 'media-replace' })
  })

  it('leaves a document without the URL alone', async () => {
    expect(
      await updateMediaReferences('/media/other.png', '/media/x.png', adapter, contentConfig),
    ).toEqual({ updated: 0, failed: [] })
    expect((await adapter.getContent('pages', 'about'))?.meta.version).toBe(1)
  })

  it('reads a document edited meanwhile again and writes on top of the edit', async () => {
    const write = adapter.writeContent.bind(adapter)
    let edited = false
    vi.spyOn(adapter, 'writeContent').mockImplementation(async (data, changedBy) => {
      if (!edited) {
        edited = true
        // Someone saves a draft between the read and the media write
        await write({
          collection: 'pages',
          slug: 'about',
          fields: { title: 'Edited', hero: '/media/old.png' },
          body: '![Team](/media/old.png)',
          expectedVersion: 1,
        })
      }
      return write(data, changedBy)
    })
    expect(
      await updateMediaReferences('/media/old.png', '/media/new.png', adapter, contentConfig),
    ).toEqual({ updated: 1, failed: [] })
    const after = await adapter.getContent('pages', 'about')
    expect(after?.fields['title']).toBe('Edited')
    expect(after?.fields['hero']).toBe('/media/new.png')
    expect(after?.meta.version).toBe(3)
  })

  it('reports a document it could not write and updates the rest', async () => {
    await adapter.writeContent({
      collection: 'pages',
      slug: 'team',
      fields: { title: 'Team', hero: '/media/old.png' },
      body: '',
      expectedVersion: 0,
    })
    const write = adapter.writeContent.bind(adapter)
    vi.spyOn(adapter, 'writeContent').mockImplementation(async (data, changedBy) => {
      if (data.slug === 'about') throw new Error('disk full')
      return write(data, changedBy)
    })
    const result = await updateMediaReferences(
      '/media/old.png',
      '/media/new.png',
      adapter,
      contentConfig,
    )
    expect(result).toEqual({
      updated: 1,
      failed: [{ collection: 'pages', slug: 'about', locale: 'en', reason: 'disk full' }],
    })
    expect((await adapter.getContent('pages', 'team'))?.fields['hero']).toBe('/media/new.png')
  })

  it('reports a document still changing after one retry', async () => {
    const write = adapter.writeContent.bind(adapter)
    let version = 1
    vi.spyOn(adapter, 'writeContent').mockImplementation(async (data, changedBy) => {
      if (data.expectedVersion !== undefined) {
        // Someone saves again before every media write
        await write({
          collection: 'pages',
          slug: 'about',
          fields: { title: `Edit ${version}`, hero: '/media/old.png' },
          body: '![Team](/media/old.png)',
          expectedVersion: version++,
        })
      }
      return write(data, changedBy)
    })
    const result = await updateMediaReferences(
      '/media/old.png',
      '/media/new.png',
      adapter,
      contentConfig,
    )
    expect(result.updated).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.slug).toBe('about')
  })
})
