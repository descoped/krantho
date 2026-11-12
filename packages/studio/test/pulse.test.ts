import { describe, expect, it } from 'vitest'
import type { CollectionInfo, ContentItem, ContentLock, PageSeoSummary } from '../src/lib/api.js'
import { hasValidStructuredData, metaCoverage } from '../src/lib/findability.js'
import { activityEvent, recentActivity, relativeTime } from '../src/pulse/pulse-activity.js'
import { needsAttention, ROWS_PER_KIND } from '../src/pulse/pulse-attention.js'
import {
  collectionCounts,
  coverageFigure,
  liveFigure,
  type PulseDocument,
  pulseScope,
  sitePages,
  structuredDataFigure,
  toPulseDocument,
} from '../src/pulse/pulse-model.js'

const COLLECTIONS: CollectionInfo[] = [
  { name: 'pages', source: 'database', directory: undefined, pages: true, sections: [] },
  { name: 'services', source: 'database', directory: undefined, pages: true, sections: [] },
  {
    name: 'faq',
    source: 'database',
    directory: undefined,
    pages: false,
    path: false,
    sections: [],
  },
  { name: 'globals', source: 'database', directory: undefined, pages: false, sections: [] },
]

const SCOPE = pulseScope(COLLECTIONS, 'en')

interface DocInput {
  collection?: string
  slug: string
  locale?: string
  version?: number
  liveVersion?: number | null
  updatedAt?: string
  fields?: Record<string, unknown>
}

function item(input: DocInput): ContentItem {
  return {
    metadata: {},
    contract: null,
    defaults: [],
    repositoryBasis: null,

    meta: {
      collection: input.collection ?? 'pages',
      slug: input.slug,
      locale: input.locale ?? 'en',
      version: input.version ?? 1,
      liveVersion: input.liveVersion === undefined ? 1 : input.liveVersion,
      status: 'published',
      source: 'database',
      changedBy: null,
      createdAt: input.updatedAt ?? '2026-10-01T10:00:00.000Z',
    },
    fields: input.fields ?? { title: input.slug, description: 'A page' },
    body: '',
    html: '',
    sections: {},
  }
}

function doc(input: DocInput): PulseDocument {
  return toPulseDocument(item(input))
}

function seoPage(
  slug: string,
  readers: PageSeoSummary['readers'],
  types: readonly string[] = [],
): PageSeoSummary {
  return {
    collection: 'pages',
    slug,
    path: `/${slug}`,
    readers,
    features: types.map((type) => ({
      reader: 'google',
      feature: 'x',
      type,
      status: 'active',
      eligible: true,
      missing: [],
      conditions: [],
      source: 'https://developers.google.com/search/docs',
    })),
  }
}

const NO_ERRORS = { errors: 0, warnings: 1, info: 0 }
const ONE_ERROR = { errors: 1, warnings: 0, info: 0 }

describe('a document as Pulse reads it', () => {
  it('takes its title from the title field, else the slug', () => {
    expect(doc({ slug: 'about', fields: { title: 'About us' } }).title).toBe('About us')
    expect(doc({ slug: 'about', fields: { title: '  ' } }).title).toBe('about')
  })

  it('takes the current version’s save time as its update time', () => {
    expect(doc({ slug: 'a', updatedAt: '2026-09-30T08:00:00.000Z' }).updatedAt).toBe(
      '2026-09-30T08:00:00.000Z',
    )
  })

  it('classes the meta description: its own, the description fallback, or none', () => {
    expect(metaCoverage({ 'meta-description': 'Own', description: 'Desc' })).toBe('covered')
    expect(metaCoverage({ description: 'Desc' })).toBe('fallback')
    expect(metaCoverage({ 'meta-description': ' ', description: '' })).toBe('missing')
    expect(metaCoverage({})).toBe('missing')
  })
})

describe('the key figures', () => {
  const documents = [
    doc({ slug: 'home', version: 2, liveVersion: 2 }),
    doc({ slug: 'about', version: 3, liveVersion: 2 }),
    doc({ slug: 'draft', version: 1, liveVersion: null }),
    doc({ collection: 'services', slug: 'strategy', version: 1, liveVersion: 1 }),
    // Not pages: a collection without pages, the globals, another locale
    doc({ collection: 'faq', slug: 'q', version: 1, liveVersion: 1 }),
    doc({ collection: 'globals', slug: 'footer', version: 1, liveVersion: 1 }),
    doc({ slug: 'home', locale: 'no', version: 1, liveVersion: 1 }),
  ]

  it('counts the pages of page-rendering collections in the default locale', () => {
    const pages = sitePages(documents, SCOPE)
    expect(pages.map((page) => `${page.collection}/${page.slug}`)).toEqual([
      'pages/home',
      'pages/about',
      'pages/draft',
      'services/strategy',
    ])
  })

  it('counts live pages and how many of them have unpublished changes', () => {
    expect(liveFigure(sitePages(documents, SCOPE))).toEqual({ pages: 4, live: 3, ahead: 1 })
  })

  it('counts meta-description coverage by class', () => {
    const pages = [
      doc({ slug: 'a', fields: { 'meta-description': 'Own' } }),
      doc({ slug: 'b', fields: { description: 'Desc' } }),
      doc({ slug: 'c', fields: { description: 'Desc' } }),
      doc({ slug: 'd', fields: { title: 'D' } }),
    ]
    expect(coverageFigure(pages)).toEqual({ pages: 4, covered: 1, fallback: 2, missing: 1 })
  })

  it('counts pages whose structured data no reader finds an error in, ignoring the page checks', () => {
    const valid = seoPage('a', { page: ONE_ERROR, 'schema.org': NO_ERRORS, google: NO_ERRORS })
    const invalid = seoPage('b', { 'schema.org': ONE_ERROR })
    const byReader = seoPage('c', { google: ONE_ERROR })
    expect(hasValidStructuredData(valid)).toBe(true)
    expect(hasValidStructuredData(invalid)).toBe(false)
    expect(hasValidStructuredData(byReader)).toBe(false)
    expect(structuredDataFigure([valid, invalid, byReader])).toMatchObject({ pages: 3, valid: 1 })
  })

  it('names the types most valid pages state, at most three, most pages first', () => {
    const figure = structuredDataFigure([
      seoPage('a', {}, ['Article', 'BreadcrumbList']),
      seoPage('b', {}, ['Article', 'Article', 'Service']),
      seoPage('c', {}, ['Service', 'Event']),
      seoPage('d', {}, ['Product']),
      // An invalid page's types do not count
      seoPage('e', { 'schema.org': ONE_ERROR }, ['Product', 'Product']),
    ])
    expect(figure.mainTypes).toEqual(['Article', 'Service', 'BreadcrumbList'])
  })

  it('counts each collection by status in the default locale, the Layout aside', () => {
    expect(collectionCounts(COLLECTIONS, documents, 'en')).toEqual([
      { collection: COLLECTIONS[0], live: 1, ahead: 1, draft: 1 },
      { collection: COLLECTIONS[1], live: 1, ahead: 0, draft: 0 },
      { collection: COLLECTIONS[2], live: 1, ahead: 0, draft: 0 },
    ])
  })
})

function lock(slug: string, lockedAt: string, locale = 'en'): ContentLock {
  return {
    collection: 'pages',
    slug,
    locale,
    lockedBy: 'editor:other@example.test',
    lockedAt,
    expiresAt: '2026-10-01T12:00:00.000Z',
  }
}

describe('needs attention', () => {
  const documents = [
    doc({ slug: 'old-ahead', version: 2, liveVersion: 1, updatedAt: '2026-09-01T00:00:00.000Z' }),
    doc({ slug: 'new-ahead', version: 4, liveVersion: 3, updatedAt: '2026-09-20T00:00:00.000Z' }),
    doc({ slug: 'no-meta', fields: { title: 'No meta', description: '' } }),
    doc({ slug: 'fallback', fields: { title: 'Fallback', description: 'Desc' } }),
    doc({ collection: 'faq', slug: 'q', fields: {} }),
    doc({ slug: 'translated', locale: 'no', version: 2, liveVersion: 1 }),
  ]

  const all = needsAttention({
    documents,
    scope: SCOPE,
    locks: [lock('fallback', '2026-10-01T09:00:00.000Z')],
    deliveries: {
      total: 3,
      latest: {
        id: 9,
        url: 'https://hooks.example.test/build',
        event: 'publish',
        status: 500,
        attempts: 3,
        nextRetryAt: null,
        createdAt: '2026-10-01T09:00:00.000Z',
        deliveredAt: null,
      },
    },
    translations: [
      {
        collection: 'pages',
        total: 3,
        items: [
          { slug: 'home', locales: ['en'], missing: ['no'] },
          { slug: 'about', locales: ['en'], missing: ['de', 'no'] },
          { slug: 'fees', locales: ['en', 'no', 'de'], missing: [] },
        ],
      },
      { collection: 'services', total: 1, items: [{ slug: 's', locales: ['en'], missing: [] }] },
    ],
  })

  it('lists failed deliveries, locks, unpublished changes, missing meta, then missing locales', () => {
    expect(all.rows.map((row) => [row.kind, row.action])).toEqual([
      ['delivery', 'Open log'],
      ['lock', 'Open'],
      ['ahead', 'Review'],
      ['ahead', 'Review'],
      ['ahead', 'Review'],
      ['meta', 'Fix'],
      ['locale', 'Locales'],
    ])
    expect(all.overflow).toEqual([])
  })

  it('opens the right screen for each row', () => {
    const to = Object.fromEntries(all.rows.map((row) => [row.key, row.to]))
    expect(to['delivery:failed']).toBe('/setup/integrations')
    expect(to['lock:pages/fallback/en']).toBe('/site/pages/fallback')
    expect(to['ahead:pages/new-ahead/en']).toBe('/site/pages/new-ahead')
    expect(to['ahead:pages/translated/no']).toBe('/site/pages/translated?locale=no')
    expect(to['meta:pages/no-meta']).toBe('/site/pages/no-meta')
    expect(to['locale:pages']).toBe('/setup/locales')
  })

  it('says what each row is about', () => {
    const [delivery, locked] = all.rows
    const newest = all.rows.find((row) => row.key === 'ahead:pages/new-ahead/en')
    expect(delivery?.title).toBe('3 webhook deliveries failed')
    expect(delivery?.detail).toBe('Latest: publish to https://hooks.example.test/build')
    expect(locked?.title).toBe('Fallback is being edited by other@example.test')
    expect(newest?.title).toBe('new-ahead has unpublished changes')
    expect(newest?.detail).toBe('Pages · version 3 is live, version 4 is saved')
    const locale = all.rows.at(-1)
    expect(locale?.title).toBe('Pages: 2 documents are missing a locale version')
    expect(locale?.detail).toBe('No version in de, no')
  })

  it('lists unpublished changes newest first, in every locale', () => {
    const ahead = all.rows.filter((row) => row.kind === 'ahead').map((row) => row.key)
    expect(ahead).toEqual([
      'ahead:pages/translated/no',
      'ahead:pages/new-ahead/en',
      'ahead:pages/old-ahead/en',
    ])
  })

  it('flags only pages with neither a meta description nor a description', () => {
    expect(all.rows.filter((row) => row.kind === 'meta').map((row) => row.key)).toEqual([
      'meta:pages/no-meta',
    ])
  })

  it('adds no rows for a source that is off or unread', () => {
    const quiet = needsAttention({
      documents: [doc({ slug: 'fine', fields: { description: 'Desc' } })],
      scope: SCOPE,
      locks: null,
      deliveries: null,
      translations: null,
    })
    expect(quiet).toEqual({ rows: [], overflow: [] })
  })

  it('caps each kind and counts the rest', () => {
    const many = Array.from({ length: ROWS_PER_KIND + 2 }, (_, i) =>
      doc({ slug: `p${i}`, version: 2, liveVersion: 1 }),
    )
    const capped = needsAttention({
      documents: many,
      scope: SCOPE,
      locks: [],
      deliveries: { total: 0, latest: null },
      translations: [],
    })
    expect(capped.rows).toHaveLength(ROWS_PER_KIND)
    expect(capped.overflow).toEqual([{ kind: 'ahead', count: 2 }])
  })
})

describe('recent activity', () => {
  it('reads the event from the versions: created, published, draft saved', () => {
    expect(activityEvent(doc({ slug: 'a', version: 1, liveVersion: null }))).toBe('created')
    expect(activityEvent(doc({ slug: 'b', version: 1, liveVersion: 1 }))).toBe('published')
    expect(activityEvent(doc({ slug: 'c', version: 3, liveVersion: 3 }))).toBe('published')
    expect(activityEvent(doc({ slug: 'd', version: 2, liveVersion: 1 }))).toBe('saved')
    expect(activityEvent(doc({ slug: 'e', version: 2, liveVersion: null }))).toBe('saved')
  })

  it('lists the latest documents newest first, up to the limit', () => {
    const documents = [
      doc({ slug: 'old', updatedAt: '2026-09-01T00:00:00.000Z' }),
      doc({ slug: 'newest', updatedAt: '2026-10-01T00:00:00.000Z' }),
      doc({ slug: 'middle', updatedAt: '2026-09-15T00:00:00.000Z' }),
    ]
    expect(recentActivity(documents, 2).map((entry) => entry.document.slug)).toEqual([
      'newest',
      'middle',
    ])
  })

  it('says how long ago, then the date after a week', () => {
    const now = Date.parse('2026-10-02T12:00:00.000Z')
    expect(relativeTime('2026-10-02T11:59:30.000Z', now, 'en')).toBe('just now')
    expect(relativeTime('2026-10-02T11:55:00.000Z', now, 'en')).toBe('5 minutes ago')
    expect(relativeTime('2026-10-02T09:00:00.000Z', now, 'en')).toBe('3 hours ago')
    expect(relativeTime('2026-10-01T12:00:00.000Z', now, 'en')).toBe('yesterday')
    expect(relativeTime('2026-09-01T12:00:00.000Z', now, 'en')).toBe('Sep 1, 2026')
  })
})
