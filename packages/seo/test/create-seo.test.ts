import { afterEach, describe, expect, it } from 'vitest'
import type { SeoSettings } from '../src/create-seo.js'
import { createSeo, SeoConfigurationError } from '../src/create-seo.js'
import { registerProfile } from '../src/profiles/index.js'

function settings(
  overrides: { site?: Partial<SeoSettings['site']>; seo?: Partial<SeoSettings['seo']> } = {},
): SeoSettings {
  return {
    site: {
      domain: 'example.org',
      name: 'Example',
      language: 'en',
      baseUrl: 'https://example.org',
      sameAs: [],
      ...overrides.site,
    },
    seo: {
      collections: {},
      routes: {},
      richCollections: {},
      richRoutes: {},
      readers: ['google', 'bing'],
      definitions: { site: null, collections: {}, documents: {}, routes: {} },
      ...overrides.seo,
    },
  }
}

function errorOf(run: () => unknown): SeoConfigurationError {
  try {
    run()
  } catch (error) {
    if (error instanceof SeoConfigurationError) return error
    throw error
  }
  throw new Error('expected a SeoConfigurationError')
}

describe('createSeo', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('should create the subsystem from a minimal configuration', () => {
    const seo = createSeo(settings())
    expect(seo.readers).toEqual(['google', 'bing'])
    expect(seo.site.name).toBe('Example')
    expect(seo.findings).toEqual([])
  })

  it('should warn about identity values a reader recommends, naming the setting', () => {
    const seo = createSeo(settings({ seo: { identity: 'Organization' } }))
    const settingsNamed = seo.findings.map((f) => f.setting)
    expect(settingsNamed).toEqual(
      expect.arrayContaining(['site.logo', 'site.description', 'site.sameAs']),
    )
    expect(seo.findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('should not warn about a value the site configures, or one the SEO settings set', () => {
    const seo = createSeo(
      settings({
        site: {
          logo: 'https://example.org/logo.png',
          description: 'D',
          alternateName: 'Ex',
          sameAs: ['https://x.org/ex'],
        },
        seo: { site: { entities: [{ '@type': 'Organization', properties: {} }] } },
      }),
    )
    expect(seo.findings).toEqual([])
  })

  it('should stop on a value of the identity a reader requires', () => {
    restore = registerProfile({
      id: 'strict',
      name: 'Strict',
      rules: [
        {
          type: 'Organization',
          status: 'active',
          required: ['logo'],
          source: 'https://example.org/r',
          verifiedAt: '2026-10-02',
        },
      ],
    })
    const error = errorOf(() =>
      createSeo(settings({ seo: { identity: 'Organization', readers: ['strict'] } })),
    )
    expect(error.findings).toEqual([
      expect.objectContaining({ severity: 'error', setting: 'site.logo' }),
    ])
    expect(error.message).toContain('site.logo')
  })

  it('should stop on a reader that is not registered', () => {
    const error = errorOf(() => createSeo(settings({ seo: { readers: ['nope'] } })))
    expect(error.findings[0]).toMatchObject({ setting: 'seo.readers' })
  })

  it('should stop on types that are unknown, superseded or retired, wherever they are configured', () => {
    const error = errorOf(() =>
      createSeo(
        settings({
          seo: {
            collections: { posts: ['Atricle'] },
            richRoutes: { '/code/*': { entities: [{ '@type': 'Code', properties: {} }] } },
            definitions: {
              site: { entities: [{ '@type': 'StupidType', properties: {} }] },
              collections: {},
              documents: {},
              routes: {},
            },
          },
        }),
      ),
    )
    expect(error.findings.map((f) => f.setting)).toEqual([
      'seo.collections.posts',
      'seo.richRoutes./code/*',
      'seo.configDir (site)',
    ])
    expect(error.findings[1]?.message).toContain('superseded by "SoftwareSourceCode"')
  })

  it('should note a pending type without stopping', () => {
    const seo = createSeo(settings({ seo: { collections: { stories: ['AmpStory'] } } }))
    expect(seo.findings).toEqual([
      expect.objectContaining({ severity: 'info', setting: 'seo.collections.stories' }),
    ])
  })

  it('should compose with the site identity and validate against the active readers', () => {
    const seo = createSeo(settings({ site: { logo: 'https://example.org/logo.png' } }))
    const graph = seo.compose({
      config: { entities: [{ '@type': 'Event', properties: {} }] },
      fields: { title: 'Talk' },
      path: '/events/talk',
      siteLevel: { entities: [{ '@type': 'Organization', properties: {} }] },
    })
    expect(graph['@graph'][0]?.logo).toBe('https://example.org/logo.png')
    const findings = seo.validate(graph)
    expect(findings.some((f) => f.profile === 'google' && f.property === 'startDate')).toBe(true)
  })
})
