import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { QueryProjection } from '@krantho/persistence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSystemAdapter } from '../src/filesystem.js'

describe('FileSystemAdapter summaries', () => {
  let dir: string
  let adapter: FileSystemAdapter

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'krantho-fs-'))
    adapter = new FileSystemAdapter({ contentPath: dir, defaultLocale: 'en' })
    await writeFile(join(dir, 'home.md'), '---\ntitle: Home\n---\n# Home\n\nBody')
    await writeFile(join(dir, 'draft.md'), '---\ntitle: Draft\nstatus: draft\n---\nDraft')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists documents as its full lists do, minus the content', async () => {
    const withoutContent = (docs: Array<{ meta: unknown; fields: unknown; metadata: unknown }>) =>
      docs.map(({ meta, fields, metadata }) => ({ meta, fields, metadata }))

    const read = async <P extends QueryProjection>(state: 'current' | 'published', projection: P) =>
      (await adapter.query({ state, projection, collections: ['pages'], sort: 'title:asc' })).items

    const metas = await read('current', 'meta')
    const full = await read('current', 'full')
    expect(metas).toEqual(full.map(({ meta }) => meta))
    expect(metas.map((meta) => meta.slug)).toEqual(['draft', 'home'])

    const current = await read('current', 'summary')
    expect(current).toEqual(withoutContent(full))
    expect(current.map((s) => s.meta.slug)).toEqual(['draft', 'home'])
    for (const summary of current) {
      expect(Object.keys(summary)).toEqual(['meta', 'fields', 'metadata'])
    }

    const live = await read('published', 'summary')
    expect(live).toEqual(withoutContent(await read('published', 'full')))
    expect(live.map((s) => s.fields.title)).toEqual(['Home'])
    for (const summary of live) {
      expect(Object.keys(summary)).toEqual(['meta', 'fields', 'metadata'])
    }
  })
})
