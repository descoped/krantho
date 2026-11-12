import { describe, expect, it } from 'vitest'
import type { CollectionInfo, ContentItem, PageSeoSummary } from '../src/lib/api.js'
import {
  pageUrl,
  type RowContext,
  type SiteRow,
  selectedShown,
  shownCount,
  shownRows,
  statusCounts,
  toggleAllShown,
  toSiteRow,
} from '../src/site/site-model.js'
import { exportFilename, parseImport } from '../src/site/transfer.js'

const PAGES: CollectionInfo = {
  name: 'pages',
  source: 'database',
  directory: undefined,
  pages: true,
  sections: [],
}
const BLOG: CollectionInfo = {
  name: 'blog',
  source: 'database',
  directory: undefined,
  pages: true,
  path: '/blog/:slug',
  sections: [],
}
const GLOBALS: CollectionInfo = {
  name: 'globals',
  source: 'database',
  directory: undefined,
  pages: false,
  sections: [],
}

function item(
  collection: string,
  slug: string,
  version: number,
  liveVersion: number | null,
  fields: Record<string, unknown> = {},
  locale = 'en',
  createdAt = '2026-10-01T10:00:00.000Z',
): ContentItem {
  return {
    metadata: {},
    contract: null,
    defaults: [],
    repositoryBasis: null,

    meta: {
      collection,
      slug,
      locale,
      version,
      liveVersion,
      status: 'draft',
      source: 'database',
      changedBy: null,
      createdAt,
    },
    fields,
    body: '',
    html: '',
    sections: {},
  }
}

function summary(slug: string, errors: number): PageSeoSummary {
  return {
    collection: 'pages',
    slug,
    path: `/${slug}`,
    readers: {
      google: { errors, warnings: 0, info: 0 },
      page: { errors: 1, warnings: 0, info: 0 },
    },
    features: [],
  }
}

function context(overrides: Partial<RowContext> = {}): RowContext {
  return {
    collection: PAGES,
    defaultLocale: 'en',
    findings: { state: 'ok', value: [summary('about', 0), summary('pricing', 2)] },
    translations: {
      state: 'ok',
      value: {
        supportedLocales: ['en', 'no', 'de'],
        collections: [
          {
            collection: 'pages',
            total: 1,
            items: [{ slug: 'about', locales: ['no', 'en'], missing: ['de'] }],
          },
        ],
      },
    },
    ...overrides,
  }
}

describe('toSiteRow', () => {
  it('reads the status, the live version, the title and the page URL', () => {
    const row = toSiteRow(item('pages', 'about', 3, 2, { title: 'About us' }), context())
    expect(row).toMatchObject({
      title: 'About us',
      status: 'ahead',
      version: 3,
      liveVersion: 2,
      path: '/about',
      updatedAt: '2026-10-01T10:00:00.000Z',
    })
    expect(toSiteRow(item('pages', 'home', 1, 1), context()).path).toBe('/')
    expect(toSiteRow(item('blog', 'hello', 1, null), context({ collection: BLOG })).path).toBe(
      '/blog/hello',
    )
  })

  it('falls back to the slug for a document without a title', () => {
    expect(toSiteRow(item('pages', 'contact', 1, null, { title: ' ' }), context()).title).toBe(
      'contact',
    )
  })

  it('classifies the meta description as Pulse does', () => {
    const own = item('pages', 'a', 1, 1, { 'meta-description': 'Own', description: 'D' })
    const fallback = item('pages', 'b', 1, 1, { description: 'D' })
    const missing = item('pages', 'c', 1, 1, {})
    expect(toSiteRow(own, context()).meta).toBe('covered')
    expect(toSiteRow(fallback, context()).meta).toBe('fallback')
    expect(toSiteRow(missing, context()).meta).toBe('missing')
  })

  it('reads the live graph from the findings, ignoring the page reader', () => {
    expect(toSiteRow(item('pages', 'about', 1, 1), context()).graph).toBe('valid')
    expect(toSiteRow(item('pages', 'pricing', 1, 1), context()).graph).toBe('errors')
    expect(toSiteRow(item('pages', 'draft', 1, null), context()).graph).toBe('not-live')
    const norwegian = item('pages', 'about', 1, 1, {}, 'no')
    expect(toSiteRow(norwegian, context()).graph).toBe('default-locale-only')
  })

  it('is honest when a source is off or failed', () => {
    const off = context({ findings: { state: 'off' }, translations: { state: 'off' } })
    expect(toSiteRow(item('pages', 'about', 1, 1), off)).toMatchObject({
      graph: 'off',
      locales: { state: 'off' },
    })
    const failed = context({ findings: { state: 'failed' }, translations: { state: 'failed' } })
    expect(toSiteRow(item('pages', 'about', 1, 1), failed)).toMatchObject({
      graph: 'failed',
      locales: { state: 'failed' },
    })
  })

  it('lists the locale versions in the supported order, with the missing ones', () => {
    expect(toSiteRow(item('pages', 'about', 1, 1), context()).locales).toEqual({
      state: 'ok',
      present: ['en', 'no'],
      missing: ['de'],
    })
  })

  it("never marks the row's own locale missing, even when the status omits the slug", () => {
    const unknown = toSiteRow(item('pages', 'new-page', 1, null, {}, 'no'), context())
    expect(unknown.locales).toEqual({ state: 'ok', present: ['no'], missing: ['en', 'de'] })
  })

  it('gives a collection without pages no URL, meta or graph', () => {
    const row = toSiteRow(item('globals', 'footer', 1, 1), context({ collection: GLOBALS }))
    expect(row).toMatchObject({ path: null, meta: null, graph: null })
  })
})

function row(slug: string, status: SiteRow['status'], updatedAt: string): SiteRow {
  return {
    collection: 'pages',
    slug,
    locale: 'en',
    title: slug,
    status,
    version: 2,
    liveVersion: status === 'draft' ? null : 1,
    updatedAt,
    path: `/${slug}`,
    meta: 'covered',
    graph: 'valid',
    locales: { state: 'off' },
  }
}

const ROWS: SiteRow[] = [
  row('beta', 'live', '2026-10-01T10:00:00.000Z'),
  row('alpha', 'ahead', '2026-10-02T10:00:00.000Z'),
  row('gamma', 'draft', '2026-09-30T10:00:00.000Z'),
  row('delta', 'live', '2026-10-03T10:00:00.000Z'),
]

describe('filtering, sorting and counting', () => {
  it('filters by the §2 status and keeps every row for All', () => {
    expect(shownRows(ROWS, 'live', 'slug').map((r) => r.slug)).toEqual(['beta', 'delta'])
    expect(shownRows(ROWS, 'ahead', 'slug').map((r) => r.slug)).toEqual(['alpha'])
    expect(shownRows(ROWS, 'draft', 'slug').map((r) => r.slug)).toEqual(['gamma'])
    expect(shownRows(ROWS, 'all', 'slug')).toHaveLength(4)
  })

  it('sorts by the latest save first, or by slug', () => {
    expect(shownRows(ROWS, 'all', 'updated').map((r) => r.slug)).toEqual([
      'delta',
      'alpha',
      'beta',
      'gamma',
    ])
    expect(shownRows(ROWS, 'all', 'slug').map((r) => r.slug)).toEqual([
      'alpha',
      'beta',
      'delta',
      'gamma',
    ])
  })

  it('never reorders the rows it was given', () => {
    shownRows(ROWS, 'all', 'slug')
    expect(ROWS.map((r) => r.slug)).toEqual(['beta', 'alpha', 'gamma', 'delta'])
  })

  it('counts each status and reads the shown-count as "N of M"', () => {
    expect(statusCounts(ROWS)).toEqual({ total: 4, live: 2, ahead: 1, draft: 1 })
    expect(shownCount(2, 4)).toBe('2 of 4')
  })
})

describe('selection', () => {
  it('selects every shown row, then clears when all are selected', () => {
    const all = toggleAllShown(new Set(['beta']), ['beta', 'delta'])
    expect([...all]).toEqual(['beta', 'delta'])
    expect(toggleAllShown(all, ['beta', 'delta']).size).toBe(0)
  })

  it('acts only on the selected rows that are shown', () => {
    expect(selectedShown(new Set(['beta', 'gamma']), ['beta', 'delta'])).toEqual(['beta'])
  })
})

describe('page URLs', () => {
  it('joins the base URL and the path once', () => {
    expect(pageUrl('https://fjord.example/', '/about')).toBe('https://fjord.example/about')
    expect(pageUrl('https://fjord.example', '/')).toBe('https://fjord.example/')
  })
})

describe('import files', () => {
  it('preserves identity, metadata, provenance, contract and basis from a portable export', () => {
    const item = {
      identity: { collection: 'pages', slug: 'about', locale: 'no' },
      fields: { title: 'Om' },
      body: 'Hei',
      metadata: { sharing: { description: 'About' } },
      contract: null,
      defaults: [
        {
          collection: 'globals',
          slug: 'defaults',
          locale: 'no',
          version: 2,
          paths: ['metadata.sharing.description'],
          values: { 'metadata.sharing.description': 'About' },
        },
      ],
      basis: { version: 3, checksum: 'agreed' },
    }
    expect(parseImport(JSON.stringify({ items: [item] }))).toEqual({ ok: true, items: [item] })
  })

  it('rejects an incomplete document rather than dropping the missing envelope', () => {
    expect(
      parseImport(
        JSON.stringify({ items: [{ slug: 'new-page', fields: { title: 'New' }, body: 'Hi' }] }),
      ).ok,
    ).toBe(false)
  })

  it('says why a file cannot be imported', () => {
    expect(parseImport('{')).toEqual({ ok: false, error: 'This is not valid JSON.' })
    expect(parseImport('{}')).toEqual({ ok: false, error: 'The JSON needs an "items" array.' })
    expect(parseImport('{"items":[]}')).toEqual({ ok: false, error: 'The "items" array is empty.' })
    expect(parseImport('{"items":[{"fields":{}}]}')).toEqual({
      ok: false,
      error: 'Item 1 is missing its document identity or portable content envelope.',
    })
  })

  it('names the download after the collection and locale', () => {
    expect(exportFilename('pages', 'en')).toBe('pages-en.json')
  })
})
