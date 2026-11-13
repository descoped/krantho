import { describe, expect, it } from 'vitest'
import { collection, definePage, sections, slug } from '../src/page/index.js'

describe('slug()', () => {
  it('creates a slug reference', () => {
    const ref = slug('pages', 'home')
    expect(ref.type).toBe('slug')
    expect(ref.slug).toBe('home')
  })

  it('keeps collection identity separate from the slug', () => {
    const ref = slug('blog', 'my-post')
    expect(ref.slug).toBe('my-post')
  })

  it('supports dynamic params', () => {
    const ref = slug('blog', ':slug')
    expect(ref.slug).toBe(':slug')
  })
})

describe('sections()', () => {
  it('creates a sections reference with named sections', () => {
    const ref = sections('pages', 'services', ['strategy', 'advisory'])
    expect(ref.type).toBe('sections')
    expect(ref.slug).toBe('services')
    expect(ref.names).toEqual(['strategy', 'advisory'])
  })

  it('supports wildcard for all sections', () => {
    const ref = sections('pages', 'services', '*')
    expect(ref.names).toBe('*')
  })
})

describe('collection()', () => {
  it('creates a collection reference with defaults', () => {
    const ref = collection('blog')
    expect(ref.type).toBe('collection')
    expect(ref.collection).toBe('blog')
    expect(ref.options).toEqual({})
  })

  it('accepts filter options', () => {
    const ref = collection('blog', {
      sort: 'date:desc',
      limit: 3,
      offset: 0,
      exclude: ':slug',
    })
    expect(ref.options.sort).toBe('date:desc')
    expect(ref.options.limit).toBe(3)
    expect(ref.options.exclude).toBe(':slug')
  })
})

describe('definePage()', () => {
  it('creates a page definition', () => {
    const page = definePage({
      route: '/',
      content: {
        hero: slug('pages', 'home'),
        services: sections('pages', 'services', ['strategy', 'advisory']),
        posts: collection('blog', { limit: 3 }),
      },
    })

    expect(page.route).toBe('/')
    expect(Object.keys(page.content)).toEqual(['hero', 'services', 'posts'])
    expect(page.content.hero?.type).toBe('slug')
    expect(page.content.services?.type).toBe('sections')
    expect(page.content.posts?.type).toBe('collection')
  })

  it('throws when route is empty', () => {
    expect(() =>
      definePage({
        route: '',
        content: { hero: slug('pages', 'home') },
      }),
    ).toThrow('Page route is required')
  })

  it('throws when content is empty', () => {
    expect(() =>
      definePage({
        route: '/',
        content: {},
      }),
    ).toThrow('must have at least one content reference')
  })

  it('supports dynamic routes', () => {
    const page = definePage({
      route: '/blog/:slug',
      content: {
        post: slug('blog', ':slug'),
        related: collection('blog', { exclude: ':slug', limit: 3 }),
      },
    })

    expect(page.route).toBe('/blog/:slug')
  })
})
