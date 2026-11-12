import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSystemAdapter } from '../src/filesystem.js'

describe('FileSystemAdapter published reads', () => {
  let dir: string
  let adapter: FileSystemAdapter

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'krantho-fs-'))
    adapter = new FileSystemAdapter({ contentPath: dir, defaultLocale: 'en' })
    await writeFile(join(dir, 'home.md'), '---\ntitle: Home\n---\n# Home')
    await writeFile(join(dir, 'about.md'), '---\ntitle: About\nstatus: published\n---\nAbout')
    await writeFile(join(dir, 'draft.md'), '---\ntitle: Draft\nstatus: draft\n---\nDraft')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('treats a file without a status as published and a draft file as not live', async () => {
    expect((await adapter.getPublished('pages', 'home'))?.fields['title']).toBe('Home')
    expect(await adapter.getPublished('pages', 'draft')).toBeNull()
    expect(await adapter.getPublished('pages', 'missing')).toBeNull()
  })

  it('lists only the published files', async () => {
    const { items: live } = await adapter.query({
      state: 'published',
      projection: 'full',
      collections: ['pages'],
      sort: 'title:asc',
    })

    expect(live.map((doc) => doc.fields['title'])).toEqual(['About', 'Home'])
  })

  it('follows a configured default status for files without one', async () => {
    const drafts = new FileSystemAdapter({
      contentPath: dir,
      defaultLocale: 'en',
      defaultStatus: 'draft',
    })

    expect(await drafts.getPublished('pages', 'home')).toBeNull()
    expect((await drafts.getPublished('pages', 'about'))?.fields['title']).toBe('About')
  })

  it('keeps a saved file at its status: a save to a published file is live at once', async () => {
    await adapter.writeContent({
      collection: 'pages',
      slug: 'about',
      fields: { title: 'About us', status: 'published' },
      body: 'About',
    })

    const about = await adapter.getContent('pages', 'about')
    expect(about?.meta).toMatchObject({ status: 'published', version: 1, liveVersion: 1 })
    expect((await adapter.getPublished('pages', 'about'))?.fields['title']).toBe('About us')
  })

  it('writes the status a publication sets: publish, unpublish, archive', async () => {
    const write = (publication: 'publish' | 'unpublish' | 'archive') =>
      adapter.writeContent({
        collection: 'pages',
        slug: 'draft',
        fields: { title: 'Draft' },
        body: 'Draft',
        publication,
      })

    await write('publish')
    expect((await adapter.getContent('pages', 'draft'))?.meta).toMatchObject({
      status: 'published',
      liveVersion: 1,
    })
    await write('unpublish')
    expect(await adapter.getPublished('pages', 'draft')).toBeNull()
    expect((await adapter.getContent('pages', 'draft'))?.meta.status).toBe('draft')
    await write('archive')
    expect((await adapter.getContent('pages', 'draft'))?.meta).toMatchObject({
      status: 'archived',
      liveVersion: null,
    })
  })

  it('deletes the file of the document whatever locale is named, since a file holds one document', async () => {
    await adapter.deleteContent('pages', 'about', 'nb')

    expect(await adapter.exists('about')).toBe(false)
    expect(await adapter.exists('home')).toBe(true)
  })

  it('gives a file that declares no locale the configured default locale', async () => {
    const nordic = new FileSystemAdapter({ contentPath: dir, defaultLocale: 'nb' })
    await writeFile(join(dir, 'engelsk.md'), '---\ntitle: English\nlocale: en\n---\nText')

    expect((await nordic.getContent('pages', 'home'))?.meta.locale).toBe('nb')
    expect((await nordic.getContent('pages', 'engelsk'))?.meta.locale).toBe('en')
    const { items: listed } = await nordic.query({
      state: 'current',
      projection: 'meta',
      collections: ['pages'],
    })
    expect(listed.find((meta) => meta.slug === 'home')?.locale).toBe('nb')
  })
})
