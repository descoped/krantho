import { describe, expect, it } from 'vitest'
import { collectionTagOf } from '../src/cache-tags.js'
import {
  collectionBasePath,
  collectionTag,
  documentPath,
  documentReadTags,
  documentTag,
  invalidationsFor,
  jsonLdTags,
  listReadTags,
  pageCollection,
  rendersPages,
  SITE_TAG,
  seoReadTags,
  seoTag,
} from '../src/index.js'

describe('cache tags', () => {
  it('names a document, a collection and an SEO configuration', () => {
    expect(documentTag('pages', 'about')).toBe('k:d:pages:about')
    expect(collectionTag('services')).toBe('k:c:services')
    expect(seoTag()).toBe('k:seo')
    expect(seoTag('collection:pages')).toBe('k:seo:collection%3apages')
  })

  it('keeps tags printable lowercase ASCII without commas or spaces', () => {
    const tag = documentTag('Pages', 'Om oss, blåbær')
    expect(tag).toBe(documentTag('pages', 'om oss, blåbær'))
    expect(tag).toMatch(/^[\x21-\x7e]+$/)
    expect(tag).not.toMatch(/[, A-Z]/)
  })

  it('shortens an over-long tag with a stable hash', () => {
    const slug = 'a'.repeat(300)
    const tag = documentTag('pages', slug)
    expect(tag.length).toBeLessThanOrEqual(120)
    expect(tag).toBe(documentTag('pages', slug))
    expect(tag).not.toBe(documentTag('pages', `${slug}b`))
  })

  it('tags a document, list and SEO configuration read with the site and what it read', () => {
    expect(documentReadTags('pages', 'about')).toEqual([SITE_TAG, 'k:d:pages:about'])
    expect(listReadTags('services')).toEqual([SITE_TAG, 'k:c:services'])
    expect(seoReadTags('collection:pages')).toEqual([SITE_TAG, 'k:seo', 'k:seo:collection%3apages'])
  })

  it('refreshes document SEO properties when the owning document is published', () => {
    const tags = seoReadTags('doc:pages/company/about')
    const published = invalidationsFor({
      kind: 'document',
      collection: 'pages',
      slug: 'company/about',
      live: true,
    })
    expect(tags).toContain(documentTag('pages', 'company/about'))
    expect(published.some((change) => change.tags.some((tag) => tags.includes(tag)))).toBe(true)
    expect(
      invalidationsFor({
        kind: 'document',
        collection: 'pages',
        slug: 'company/about',
        live: false,
      }),
    ).toEqual([])
  })

  it('finds the collection tag a document tag belongs to', () => {
    expect(collectionTagOf(documentTag('pages', 'about'))).toBe(collectionTag('pages'))
    expect(collectionTagOf(documentTag('Blåbær', 'x'))).toBe(collectionTag('Blåbær'))
    expect(collectionTagOf(documentTag('pages', 'a'.repeat(300)))).toBe(collectionTag('pages'))
    expect(collectionTagOf(collectionTag('pages'))).toBeNull()
    expect(collectionTagOf(SITE_TAG)).toBeNull()
  })

  it('tags a JSON-LD read with the document, which holds its own SEO, and the scopes it composes', () => {
    expect(jsonLdTags('pages', 'about')).toEqual([
      SITE_TAG,
      'k:d:pages:about',
      'k:seo',
      'k:seo:site',
      'k:seo:collection%3apages',
      'k:seo:route',
    ])
  })
})

describe('documentPath', () => {
  it('without a declared path, serves pages at the root, home at /, other collections under their name', () => {
    expect(documentPath({ name: 'pages' }, 'home')).toBe('/')
    expect(documentPath({ name: 'pages' }, 'about')).toBe('/about')
    expect(documentPath({ name: 'services' }, 'audit')).toBe('/services/audit')
    expect(documentPath({ name: 'services', path: undefined }, 'index')).toBe('/services/index')
    expect(documentPath({ name: 'globals' }, 'navigation')).toBeNull()
  })

  it('fills a declared pattern with the slug', () => {
    expect(documentPath({ name: 'hosts', path: '/deploy/:slug' }, 'vercel')).toBe('/deploy/vercel')
    expect(documentPath({ name: 'pages', path: '/:slug' }, 'home')).toBe('/home')
    expect(documentPath({ name: 'globals', path: '/site/:slug' }, 'footer')).toBe('/site/footer')
  })

  it('renders the slug index at the pattern without its slug segment', () => {
    expect(documentPath({ name: 'docs', path: '/docs/:slug' }, 'index')).toBe('/docs')
    expect(documentPath({ name: 'pages', path: '/:slug' }, 'index')).toBe('/')
  })

  it('renders every document of a fixed-path collection at that path', () => {
    expect(documentPath({ name: 'landing', path: '/' }, 'home')).toBe('/')
    expect(documentPath({ name: 'landing', path: '/' }, 'other')).toBe('/')
    expect(documentPath({ name: 'pricing', path: '/pricing' }, 'index')).toBe('/pricing')
  })

  it('gives a collection declared without pages no path', () => {
    expect(documentPath({ name: 'faq', path: false }, 'refunds')).toBeNull()
    expect(documentPath({ name: 'pages', path: false }, 'home')).toBeNull()
  })
})

describe('collectionBasePath', () => {
  it('is null for a collection without pages', () => {
    expect(collectionBasePath({ name: 'faq', path: false })).toBeNull()
    expect(collectionBasePath({ name: 'pages', path: false })).toBeNull()
    expect(collectionBasePath({ name: 'globals' })).toBeNull()
  })

  it('drops the /:slug segment of a declared path', () => {
    expect(collectionBasePath({ name: 'hosts', path: '/deploy/:slug' })).toBe('/deploy')
    expect(collectionBasePath({ name: 'docs', path: '/docs/:slug' })).toBe('/docs')
  })

  it('reads / when only the /:slug segment was declared', () => {
    expect(collectionBasePath({ name: 'pages', path: '/:slug' })).toBe('/')
  })

  it('keeps a declared path without :slug as it is', () => {
    expect(collectionBasePath({ name: 'pricing', path: '/pricing' })).toBe('/pricing')
    expect(collectionBasePath({ name: 'landing', path: '/' })).toBe('/')
  })

  it('places pages at the root and other collections under their name by default', () => {
    expect(collectionBasePath({ name: 'pages' })).toBe('/')
    expect(collectionBasePath({ name: 'services' })).toBe('/services')
    expect(collectionBasePath({ name: 'services', path: undefined })).toBe('/services')
  })

  it('agrees with documentPath for a declared pattern', () => {
    const hosts = { name: 'hosts', path: '/deploy/:slug' }
    expect(documentPath(hosts, 'vercel')?.startsWith(`${collectionBasePath(hosts)}/`)).toBe(true)
  })
})

describe('pageCollection', () => {
  it('finds a collection by name, and places an unknown one by the default rule', () => {
    const collections = { hosts: { name: 'hosts', path: '/deploy/:slug' } }
    expect(pageCollection(collections, 'hosts')).toBe(collections.hosts)
    expect(pageCollection(collections, 'blog')).toEqual({ name: 'blog' })
  })
})

describe('rendersPages', () => {
  it('follows the declared path, else every collection but globals', () => {
    expect(rendersPages({ name: 'services' })).toBe(true)
    expect(rendersPages({ name: 'globals' })).toBe(false)
    expect(rendersPages({ name: 'globals', path: '/globals/:slug' })).toBe(true)
    expect(rendersPages({ name: 'faq', path: false })).toBe(false)
  })
})

describe('invalidationsFor', () => {
  it('expires a published document and refreshes its collection in the background', () => {
    expect(
      invalidationsFor({ kind: 'document', collection: 'pages', slug: 'about', live: true }),
    ).toEqual([
      { tags: ['k:d:pages:about'], mode: 'expire' },
      { tags: ['k:c:pages'], mode: 'stale' },
    ])
  })

  it('leaves pages alone for a draft save', () => {
    expect(
      invalidationsFor({ kind: 'document', collection: 'pages', slug: 'about', live: false }),
    ).toEqual([])
  })

  it('refreshes the pages showing a global in the background', () => {
    const [global] = invalidationsFor({
      kind: 'document',
      collection: 'globals',
      slug: 'navigation',
      live: true,
    })
    expect(global).toEqual({ tags: ['k:d:globals:navigation'], mode: 'stale' })
  })

  it('refreshes an SEO configuration in the background', () => {
    expect(invalidationsFor({ kind: 'seo', configId: 'site' })).toEqual([
      { tags: ['k:seo:site'], mode: 'stale' },
    ])
    expect(invalidationsFor({ kind: 'seo' })).toEqual([{ tags: ['k:seo'], mode: 'stale' }])
  })

  it('refreshes every page for a URL-pattern configuration, since any page may match it', () => {
    expect(invalidationsFor({ kind: 'seo', configId: 'route:/blog/*' })).toEqual([
      { tags: ['k:seo:route'], mode: 'stale' },
    ])
    expect(jsonLdTags('blog', 'hello')).toContain('k:seo:route')
  })

  it('refreshes every page for a site-wide change, and none for a media change', () => {
    expect(invalidationsFor({ kind: 'site' })).toEqual([{ tags: [SITE_TAG], mode: 'stale' }])
    expect(invalidationsFor({ kind: 'media', id: 'm1' })).toEqual([])
  })
})
