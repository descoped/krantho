import type { ContentRef, IPublishedContentLoader, PublishedContent } from '@krantho/core'
import { NetworkError } from '@krantho/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { CMSMarkdownServer } from '../src/components/server/CMSMarkdownServer.js'
import { CMSTextServer } from '../src/components/server/CMSTextServer.js'
import { getAllCMSContent, getAllCMSSummaries, getCMSSlugs } from '../src/server/cms-context.js'
import { initServerLoader, loadContent } from '../src/server/content-loader.js'
import { SeoJsonLd } from '../src/server/seo-jsonld.js'
import { resolveSeoContent } from '../src/server/seo-resolver.js'

function published(
  collection: string,
  slug: string,
  title: string,
  locale = 'en',
): PublishedContent {
  return {
    collection,
    slug,
    locale,
    fields: { title },
    body: `# @title\n\nIntro.\n\n## Details\n\nAbout ${title}.`,
    publishedAt: new Date('2026-09-30T00:00:00Z'),
  }
}

/** A loader holding only published documents, as `createContentLoader()` returns them */
function loaderOf(docs: PublishedContent[], preview = false): IPublishedContentLoader {
  const matches = (doc: PublishedContent, ref: ContentRef) =>
    doc.collection === ref.collection &&
    doc.slug === ref.slug &&
    doc.locale === (ref.locale ?? 'en')
  return {
    isPreview: async () => preview,
    getPublished: async (ref) => docs.find((doc) => matches(doc, ref)) ?? null,
    listPublished: async (collection, locale) =>
      docs.filter((doc) => doc.collection === collection && doc.locale === (locale ?? 'en')),
    listPublishedSummaries: async (collection, locale) =>
      docs
        .filter((doc) => doc.collection === collection && doc.locale === (locale ?? 'en'))
        .map(({ body: _body, ...summary }) => summary),
  }
}

describe('server content', () => {
  beforeEach(() => {
    initServerLoader(
      loaderOf([
        published('pages', 'home', 'Home'),
        published('pages', 'about', 'About'),
        published('blog', 'home', 'Blog home'),
        published('pages', 'home', 'Hjem', 'no'),
      ]),
    )
  })

  it('renders the published document of the named collection', async () => {
    const home = await loadContent({ collection: 'pages', slug: 'home' })

    expect(home.fields.title).toBe('Home')
    expect(home.html).toContain('<h1>Home</h1>')
    expect(Object.keys(home.sections)).toEqual(['Details'])
    expect((await loadContent({ collection: 'blog', slug: 'home' })).fields.title).toBe('Blog home')
    expect(
      (await loadContent({ collection: 'pages', slug: 'home', locale: 'no' })).fields.title,
    ).toBe('Hjem')
  })

  it('answers 404 for a document with no published version', async () => {
    const missing = loadContent({ collection: 'pages', slug: 'draft-only' })

    await expect(missing).rejects.toBeInstanceOf(NetworkError)
    await expect(missing).rejects.toMatchObject({ status: 404 })
  })

  it('lists the published documents of a collection', async () => {
    expect(await getCMSSlugs('pages')).toEqual(['home', 'about'])
    expect((await getAllCMSContent('pages')).map((doc) => doc.fields.title)).toEqual([
      'Home',
      'About',
    ])
    expect(await getCMSSlugs('pages', 'no')).toEqual(['home'])
  })

  it('lists the summaries of a collection without reading or rendering a body', async () => {
    const summaries = await getAllCMSSummaries('pages')

    expect(summaries).toEqual([
      {
        collection: 'pages',
        slug: 'home',
        locale: 'en',
        fields: { title: 'Home' },
        preview: false,
      },
      {
        collection: 'pages',
        slug: 'about',
        locale: 'en',
        fields: { title: 'About' },
        preview: false,
      },
    ])
    expect((await getAllCMSSummaries('pages', { locale: 'no' })).map((doc) => doc.slug)).toEqual([
      'home',
    ])
    expect(await getAllCMSSummaries('missing')).toEqual([])
  })

  it('marks summaries read for a preview', async () => {
    initServerLoader(loaderOf([published('pages', 'home', 'Home')], true))

    expect((await getAllCMSSummaries('pages'))[0]?.preview).toBe(true)
  })

  it('renders a field in a server component, and the fallback when nothing is published', async () => {
    const title = await CMSTextServer({ collection: 'pages', slug: 'home', field: 'title' })
    expect((title.props as { children: string }).children).toBe('Home')

    const missing = await CMSTextServer({
      collection: 'pages',
      slug: 'draft-only',
      field: 'title',
      fallback: 'Soon',
    })
    expect((missing.props as { children: string }).children).toBe('Soon')
  })

  it('returns no documents when the collection cannot be read', async () => {
    initServerLoader({
      isPreview: async () => false,
      getPublished: async () => null,
      listPublished: async () => Promise.reject(new Error('database down')),
      listPublishedSummaries: async () => Promise.reject(new Error('database down')),
    })

    expect(await getAllCMSContent('pages')).toEqual([])
    expect(await getAllCMSSummaries('pages')).toEqual([])
  })
})

describe('Live marks', () => {
  type Element = { props: Record<string, unknown> }
  const html = (element: Element): string =>
    (element.props.dangerouslySetInnerHTML as { __html: string }).__html

  it('marks the field and sections a server component renders, in a preview only', async () => {
    initServerLoader(loaderOf([published('pages', 'home', 'Home')], true))

    const title = (await CMSTextServer({
      collection: 'pages',
      slug: 'home',
      field: 'title',
    })) as Element
    expect(title.props).toMatchObject({
      'data-krantho-document': 'pages/home',
      'data-krantho-field': 'title',
    })
    const section = (await CMSMarkdownServer({
      collection: 'pages',
      slug: 'home',
      section: 'Details',
    })) as Element
    expect(section.props['data-krantho-section']).toBe('Details')
    const body = (await CMSMarkdownServer({ collection: 'pages', slug: 'home' })) as Element
    expect(html(body)).toContain('data-krantho-section="__lead" style="display:contents"')
    expect(html(body)).toContain('data-krantho-section="Details" style="display:contents"')
    expect((await loadContent({ collection: 'pages', slug: 'home' })).preview).toBe(true)
  })

  it('renders no marks for visitors', async () => {
    initServerLoader(loaderOf([published('pages', 'home', 'Home')]))

    const title = (await CMSTextServer({
      collection: 'pages',
      slug: 'home',
      field: 'title',
    })) as Element
    expect(Object.keys(title.props).some((name) => name.startsWith('data-krantho'))).toBe(false)
    const body = (await CMSMarkdownServer({ collection: 'pages', slug: 'home' })) as Element
    expect(html(body)).not.toContain('data-krantho')
  })
})

describe('server SEO', () => {
  it('resolves metadata from the SEO configuration, falling back to published fields', async () => {
    initServerLoader({
      ...loaderOf([published('pages', 'home', 'Home'), published('pages', 'about', 'About')]),
      seoProperties: async (id) =>
        id === 'doc:pages/home'
          ? { headline: 'Configured headline', description: 'Configured' }
          : {},
      jsonLd: async () => null,
    })

    const home = await resolveSeoContent('pages', 'home')
    expect(home.title).toBe('Configured headline')
    expect(home.description).toBe('Configured')
    expect((await resolveSeoContent('pages', 'about')).title).toBe('About')
  })

  it('renders the JSON-LD the loader composes, and nothing without a published graph', async () => {
    initServerLoader({
      ...loaderOf([published('pages', 'home', 'Home')]),
      seoProperties: async () => ({}),
      jsonLd: async (ref) =>
        ref.slug === 'home'
          ? { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }] }
          : null,
    })

    const script = await SeoJsonLd({ collection: 'pages', slug: 'home' })
    expect(script).not.toBeNull()
    const html = (script?.props as { dangerouslySetInnerHTML: { __html: string } } | undefined)
      ?.dangerouslySetInnerHTML.__html
    expect(html).toContain('"@type":"WebPage"')
    expect(await SeoJsonLd({ collection: 'pages', slug: 'draft-only' })).toBeNull()
  })

  it('falls back to published fields and renders no JSON-LD when the loader serves no SEO', async () => {
    initServerLoader(loaderOf([published('pages', 'home', 'Home')]))

    expect((await resolveSeoContent('pages', 'home')).title).toBe('Home')
    expect(await SeoJsonLd({ collection: 'pages', slug: 'home' })).toBeNull()
  })
})
