import { describe, expect, it, vi } from 'vitest'
import { resolvePageContent, resolveParams } from '../src/composition/index.js'
import type { IPublishedContentLoader, PublishedContent } from '../src/types.js'

const document = (collection: string, slug: string, title: string): PublishedContent => ({
  collection,
  slug,
  locale: 'en',
  fields: { title },
  metadata: { sharing: { title } },
  body: '## Intro\n\nPublished body.',
  publishedAt: new Date('2026-10-01'),
})

function loader(documents: PublishedContent[]): IPublishedContentLoader {
  return {
    getPublished: vi.fn(
      async (ref) =>
        documents.find(
          (item) =>
            item.collection === ref.collection &&
            item.slug === ref.slug &&
            item.locale === (ref.locale ?? 'en'),
        ) ?? null,
    ),
    listPublished: vi.fn(async (collection, locale) =>
      documents.filter(
        (item) => item.collection === collection && item.locale === (locale ?? 'en'),
      ),
    ),
    listPublishedSummaries: vi.fn(async (collection, locale) =>
      documents
        .filter((item) => item.collection === collection && item.locale === (locale ?? 'en'))
        .map(({ body: _body, ...summary }) => summary),
    ),
    isPreview: async () => false,
  }
}

describe('published page composition', () => {
  it('keeps identical slugs in different collections distinct and deduplicates exact references', async () => {
    const source = loader([document('pages', 'about', 'About'), document('news', 'about', 'News')])
    const result = await resolvePageContent(
      {
        route: '/',
        content: {
          page: { type: 'slug', collection: 'pages', slug: 'about' },
          news: { type: 'slug', collection: 'news', slug: 'about' },
          repeated: { type: 'slug', collection: 'pages', slug: 'about' },
        },
      },
      { loader: source },
    )
    expect(result.page).toMatchObject({
      fields: { title: 'About' },
      metadata: { sharing: { title: 'About' } },
    })
    expect(result.news).toMatchObject({ fields: { title: 'News' } })
    expect(source.getPublished).toHaveBeenCalledTimes(2)
  })

  it('uses the published loader for list scope, sorting, exclusion and pagination', async () => {
    const source = loader([
      document('news', 'b', 'B'),
      document('pages', 'x', 'X'),
      document('news', 'a', 'A'),
      document('news', 'c', 'C'),
    ])
    const result = await resolvePageContent(
      {
        route: '/',
        content: {
          news: {
            type: 'collection',
            collection: 'news',
            options: { sort: 'title:asc', exclude: ':slug', limit: 1 },
          },
        },
      },
      { loader: source },
      { slug: 'a' },
    )
    expect(result.news).toMatchObject([{ slug: 'b' }])
    expect(source.listPublished).toHaveBeenCalledWith('news', undefined)
  })

  it('returns null for unpublished documents and resolves dynamic sections with explicit locale', async () => {
    const source = loader([document('pages', 'about', 'About')])
    const result = await resolvePageContent(
      {
        route: '/',
        content: {
          missing: { type: 'slug', collection: 'pages', slug: 'draft' },
          section: {
            type: 'sections',
            collection: 'pages',
            slug: ':slug',
            locale: 'en',
            names: '*',
          },
        },
      },
      { loader: source },
      { slug: 'about' },
    )
    expect(result.missing).toBeNull()
    expect(result.section).toMatchObject([
      { name: 'Intro', html: expect.stringContaining('Published body.') },
    ])
    expect(source.getPublished).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })

  it('requires missing route parameters rather than silently reading a different document', () => {
    expect(resolveParams('blog/:slug', { slug: 'post' })).toBe('blog/post')
    expect(() => resolveParams(':slug', {})).toThrow('Missing param')
  })
})
