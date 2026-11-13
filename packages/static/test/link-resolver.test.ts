import { describe, expect, it } from 'vitest'
import { createLinkResolver, type LinkCollection } from '../src/link-resolver.js'

const docs: LinkCollection = {
  name: 'docs',
  directory: '/repo/docs',
  indexFile: 'README.md',
  path: '/:slug/',
}
const guides: LinkCollection = {
  name: 'guides',
  directory: '/repo/docs/guides',
  indexFile: undefined,
  path: '/guides/:slug/',
}
const snippets: LinkCollection = {
  name: 'snippets',
  directory: '/repo/snippets',
  indexFile: undefined,
  path: false,
}
const resolveUrl = createLinkResolver([docs, guides, snippets])
const inDocs = { collection: 'docs', slug: 'setup' }

describe('createLinkResolver', () => {
  it('links a markdown file to its page, keeping the anchor and query', () => {
    expect(resolveUrl('apps.md#limitations', inDocs)).toBe('/apps/#limitations')
    expect(resolveUrl('./apps.md?tab=1', inDocs)).toBe('/apps/?tab=1')
    expect(resolveUrl('README.md', inDocs)).toBe('/')
  })

  it('links a file in another collection to that collection’s page', () => {
    expect(resolveUrl('guides/deploy.md', inDocs)).toBe('/guides/deploy/')
    expect(resolveUrl('../setup.md', { collection: 'guides', slug: 'deploy' })).toBe('/setup/')
  })

  it('serves a file beside the markdown from the site root', () => {
    expect(resolveUrl('images/library.png', inDocs)).toBe('/images/library.png')
    expect(resolveUrl('images/my%20chart.png', inDocs)).toBe('/images/my%20chart.png')
    expect(resolveUrl('..assets/x.png', inDocs)).toBe('/..assets/x.png')
  })

  it('leaves addresses, and files with no page or outside the collection, as written', () => {
    for (const url of [
      'https://example.com/a.md',
      'mailto:team@example.com',
      '//cdn.example.com/x.png',
      '/setup/',
      '#install',
      '',
      '../LICENSE',
      '../snippets/sample.md',
      'index.md',
      'missing/notes.md',
    ]) {
      expect(resolveUrl(url, inDocs)).toBe(url)
    }
  })

  it('leaves the links of a collection it does not know as written', () => {
    expect(resolveUrl('apps.md', { collection: 'blog', slug: 'post' })).toBe('apps.md')
  })
})
