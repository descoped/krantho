import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSystemAdapter } from '../src/filesystem.js'

describe('FileSystemAdapter collection directories', () => {
  let root: string
  let adapter: FileSystemAdapter

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'krantho-fs-'))
    await mkdir(join(root, 'docs'))
    await mkdir(join(root, 'landing'))
    await writeFile(
      join(root, 'docs', 'install.md'),
      '---\ntitle: Install\nstatus: published\n---\n## Requirements\n\nNode\n\n## Steps\n\nRun it',
    )
    await writeFile(
      join(root, 'docs', 'oppsett.md'),
      '---\ntitle: Oppsett\nstatus: published\nlocale: nb\n---\nNorsk',
    )
    await writeFile(
      join(root, 'landing', 'home.md'),
      '---\ntitle: Home\nstatus: published\n---\nHi',
    )
    await writeFile(join(root, 'loose.md'), '---\ntitle: Loose\n---\nNo collection directory')
    adapter = new FileSystemAdapter({
      contentPath: root,
      defaultLocale: 'en',
      directories: new Map([
        ['docs', join(root, 'docs')],
        ['landing', join(root, 'landing')],
      ]),
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const slugsOf = async (
    state: 'current' | 'published',
    collection: string,
    sort?: string,
    locale?: string,
  ): Promise<string[]> =>
    (
      await adapter.query({ state, projection: 'meta', collections: [collection], sort, locale })
    ).items.map((meta) => meta.slug)

  it('reads a document from its collection directory', async () => {
    const doc = await adapter.getContent('docs', 'install')
    expect(doc?.fields['title']).toBe('Install')
    expect(doc?.meta.collection).toBe('docs')
    expect(await adapter.getContent('landing', 'install')).toBeNull()
    expect((await adapter.getPublished('landing', 'home'))?.fields['title']).toBe('Home')
  })

  it('lists only the files of the collection directory', async () => {
    const docs = await slugsOf('current', 'docs', 'title:asc')
    expect(docs).toEqual(['install', 'oppsett'])
    expect(await slugsOf('published', 'landing')).toEqual(['home'])
  })

  it('lists no documents for a collection whose directory does not exist yet', async () => {
    const fresh = new FileSystemAdapter({
      contentPath: root,
      defaultLocale: 'en',
      directories: new Map([['guides', join(root, 'guides')]]),
    })
    expect(
      (await fresh.query({ state: 'current', projection: 'meta', collections: ['guides'] })).items,
    ).toEqual([])
    expect(await fresh.getContent('guides', 'first')).toBeNull()
  })

  it('keeps a collection without a directory in the content path', async () => {
    expect(await slugsOf('current', 'pages')).toEqual(['loose'])
    expect((await adapter.getContent('pages', 'loose'))?.fields['title']).toBe('Loose')
  })

  it('lists one locale when asked, every locale otherwise', async () => {
    expect(await slugsOf('current', 'docs', undefined, 'nb')).toEqual(['oppsett'])
    expect(await slugsOf('current', 'docs')).toHaveLength(2)
  })

  it('renders the body to HTML and its h2 sections', async () => {
    const doc = await adapter.getContent('docs', 'install')
    expect(doc?.html).toContain('<h2')
    expect(Object.keys(doc?.sections ?? {})).toEqual(['Requirements', 'Steps'])
  })

  it('writes a document into its collection directory, creating the directory', async () => {
    const guides = new FileSystemAdapter({
      contentPath: root,
      defaultLocale: 'en',
      directories: new Map([['guides', join(root, 'guides')]]),
    })
    await guides.writeContent({
      collection: 'guides',
      slug: 'first',
      fields: { title: 'First' },
      body: 'Body',
    })
    expect(await readFile(join(root, 'guides', 'first.md'), 'utf-8')).toContain('title: "First"')
    await expect(access(join(root, 'first.md'))).rejects.toThrow()
    expect((await guides.getContent('guides', 'first'))?.fields['title']).toBe('First')
  })

  it('deletes the file in the collection directory', async () => {
    await adapter.deleteContent('docs', 'oppsett')
    await expect(access(join(root, 'docs', 'oppsett.md'))).rejects.toThrow()
    await access(join(root, 'docs', 'install.md'))
  })

  it('fails to delete a file the collection directory does not hold', async () => {
    await expect(adapter.deleteContent('landing', 'install')).rejects.toThrow()
    await access(join(root, 'docs', 'install.md'))
  })
})
