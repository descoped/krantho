import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllDocuments } from '../src/lib/api-content.js'
import type { ContentLock } from '../src/lib/api-types.js'
import type { AuthUser } from '../src/lib/auth.js'
import { documentStatus, STATUS_LABELS } from '../src/lib/document-status.js'
import { collectionLabel, singularLabel } from '../src/lib/format.js'
import { isRecord, safeHref } from '../src/lib/guards.js'
import { foreignLocks, lockHolderName, ownLockIdentity } from '../src/lib/locks.js'
import { collectionPath, editorPath, newDocumentPath } from '../src/lib/paths.js'
import { countAhead, findDocumentsAhead, publishAhead } from '../src/lib/publish-ahead.js'
import { crumbsFor } from '../src/shell/breadcrumbs.js'

describe('documentStatus', () => {
  it('is live when the live version is the current one', () => {
    expect(documentStatus({ version: 3, liveVersion: 3 })).toBe('live')
  })

  it('is ahead when a newer version is saved than the live one', () => {
    expect(documentStatus({ version: 4, liveVersion: 3 })).toBe('ahead')
  })

  it('is draft when nothing is live', () => {
    expect(documentStatus({ version: 1, liveVersion: null })).toBe('draft')
  })

  it('reads as Live, Unpublished changes and Not published', () => {
    expect(STATUS_LABELS).toEqual({
      live: 'Live',
      ahead: 'Unpublished changes',
      draft: 'Not published',
    })
  })
})

describe('status dot shapes', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/ui/status-dot.css'), 'utf8')
  const rule = (status: string): string =>
    css.slice(css.indexOf(`.ui-status-dot--${status} {`)).split('}')[0] ?? ''

  it('fills Live, half-fills Unpublished changes and rings Not published, from tokens', () => {
    expect(rule('live')).toContain('background: var(--color-live)')
    expect(rule('ahead')).toMatch(
      /linear-gradient\(90deg, var\(--color-ahead\) 50%, transparent 50%\)/,
    )
    expect(rule('ahead')).toContain('border-color: var(--color-ahead)')
    expect(rule('draft')).toContain('border-color: var(--color-draft)')
    expect(rule('draft')).toContain('background: transparent')
  })
})

describe('paths', () => {
  it('opens a global in the Layout editor and other documents under Site', () => {
    expect(editorPath('globals', 'footer')).toBe('/layout/footer')
    expect(editorPath('pages', 'about')).toBe('/site/pages/about')
    expect(editorPath('pages', 'about', 'nb')).toBe('/site/pages/about?locale=nb')
  })

  it('encodes the segments it builds', () => {
    expect(editorPath('pages', 'a b')).toBe('/site/pages/a%20b')
  })

  it('places the collection view and a new document', () => {
    expect(collectionPath('services')).toBe('/site/services')
    expect(newDocumentPath('services')).toBe('/new/services')
  })
})

describe('collection labels', () => {
  it('capitalises a collection name and spaces its words', () => {
    expect(collectionLabel('pages')).toBe('Pages')
    expect(collectionLabel('case-studies')).toBe('Case studies')
  })

  it('derives the singular from the common English endings', () => {
    expect(singularLabel('pages')).toBe('page')
    expect(singularLabel('services')).toBe('service')
    expect(singularLabel('case-studies')).toBe('case study')
    expect(singularLabel('boxes')).toBe('box')
    expect(singularLabel('matches')).toBe('match')
    expect(singularLabel('wishes')).toBe('wish')
    expect(singularLabel('faq')).toBe('faq')
  })
})

describe('crumbsFor', () => {
  const labels = (path: string): string[] => crumbsFor(path).map((crumb) => crumb.label)

  it('follows each destination', () => {
    expect(labels('/')).toEqual(['Pulse'])
    expect(labels('/site/services')).toEqual(['Site', 'Services'])
    expect(labels('/site/services/strategy')).toEqual(['Site', 'Services', 'strategy'])
    expect(labels('/new/services')).toEqual(['Site', 'Services', 'New'])
    // A document whose slug is "new" is a document like any other
    expect(labels('/site/services/new')).toEqual(['Site', 'Services', 'new'])
    expect(labels('/layout/footer')).toEqual(['Site', 'Layout', 'footer'])
    expect(labels('/structure')).toEqual(['Structure', 'Graph'])
    expect(labels('/structure/scopes')).toEqual(['Structure', 'Scopes & archetypes'])
    expect(labels('/setup/people')).toEqual(['Setup', 'People'])
    expect(labels('/setup/collections')).toEqual(['Setup', 'Collections & schema'])
    expect(labels('/media')).toEqual(['Media'])
  })

  it('links every ancestor and leaves the current screen unlinked', () => {
    expect(crumbsFor('/site/services/strategy')).toEqual([
      { label: 'Site', path: '/site' },
      { label: 'Services', path: '/site/services' },
      { label: 'strategy' },
    ])
  })

  it('reads Not found for an unknown path', () => {
    expect(labels('/settings')).toEqual(['Not found'])
  })

  it('reads only Not found when the router fell through, never naming a hidden screen', () => {
    expect(crumbsFor('/setup/people', true)).toEqual([{ label: 'Not found' }])
    expect(crumbsFor('/media', true)).toEqual([{ label: 'Not found' }])
  })
})

// ---------------------------------------------------------------------------

interface Item {
  collection: string
  slug: string
  locale: string
  version: number
  liveVersion: number | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installApi(items: Item[]): { published: unknown[]; requests: string[] } {
  const published: unknown[] = []
  const requests: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).split('?')[0] ?? ''
    requests.push(url)
    // The configuration names one locale; Setup › Locales added a second, and that is what counts
    if (url === '/api/site-config') {
      return json({ site: { supportedLocales: ['en'], defaultLocale: 'en' } })
    }
    if (url === '/api/settings/locales') {
      return json({ defaultLocale: 'en', supportedLocales: ['en', 'nb'], source: 'runtime' })
    }
    const bulk = url.match(/^\/api\/content\/([^/]+)\/bulk-publish$/)
    if (bulk && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { slugs: string[] }
      published.push({ collection: bulk[1], ...body })
      return json({ results: [], published: body.slugs.length })
    }
    if (url === '/api/content') {
      const view = new URL(String(input), 'http://x').searchParams.get('view')
      return json({
        items: items.map((meta) => (view === 'meta' ? meta : { meta, fields: {} })),
        hasMore: false,
      })
    }
    return json({ error: 'not found' }, 404)
  })
  return { published, requests }
}

describe('publish ahead', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('finds only the documents whose draft is ahead of live, per collection and locale', async () => {
    installApi([
      { collection: 'pages', slug: 'live', locale: 'en', version: 2, liveVersion: 2 },
      { collection: 'pages', slug: 'ahead', locale: 'en', version: 3, liveVersion: 2 },
      { collection: 'pages', slug: 'ahead', locale: 'nb', version: 2, liveVersion: 1 },
      { collection: 'pages', slug: 'draft', locale: 'en', version: 1, liveVersion: null },
      { collection: 'services', slug: 'next', locale: 'en', version: 5, liveVersion: 4 },
    ])
    const groups = await findDocumentsAhead()
    expect(groups).toEqual([
      { collection: 'pages', locale: 'en', slugs: ['ahead'] },
      { collection: 'pages', locale: 'nb', slugs: ['ahead'] },
      { collection: 'services', locale: 'en', slugs: ['next'] },
    ])
    expect(countAhead(groups)).toBe(3)
  })

  it('reads the documents through fetchAllDocuments: one list, no per-collection reads', async () => {
    const api = installApi([
      { collection: 'pages', slug: 'ahead', locale: 'en', version: 3, liveVersion: 2 },
      { collection: 'services', slug: 'next', locale: 'nb', version: 5, liveVersion: 4 },
    ])
    await findDocumentsAhead()
    expect(api.requests.filter((url) => url.startsWith('/api/content'))).toEqual(['/api/content'])
  })

  it('leaves out documents in a locale the site does not support', async () => {
    installApi([
      { collection: 'pages', slug: 'ahead', locale: 'en', version: 3, liveVersion: 2 },
      { collection: 'pages', slug: 'ahead', locale: 'fr', version: 3, liveVersion: 2 },
    ])
    expect(await findDocumentsAhead()).toEqual([
      { collection: 'pages', locale: 'en', slugs: ['ahead'] },
    ])
  })

  it('publishes each group through the bulk publish API in its locale', async () => {
    const api = installApi([])
    const published = await publishAhead([
      { collection: 'pages', locale: 'nb', slugs: ['ahead'] },
      { collection: 'services', locale: 'en', slugs: ['next', 'other'] },
    ])
    expect(published).toBe(3)
    expect(api.published).toEqual([
      { collection: 'pages', slugs: ['ahead'], locale: 'nb' },
      { collection: 'services', slugs: ['next', 'other'], locale: 'en' },
    ])
  })

  it('fails when the API refuses', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'Insufficient permissions' }, 403))
    await expect(
      publishAhead([{ collection: 'pages', locale: 'en', slugs: ['ahead'] }]),
    ).rejects.toThrow('Insufficient permissions')
  })
})

// ---------------------------------------------------------------------------

describe('locks', () => {
  const NOW = Date.parse('2026-10-02T12:00:00Z')
  const LATER = '2026-10-02T12:05:00Z'
  const EARLIER = '2026-10-02T11:55:00Z'
  const editor: AuthUser = { email: 'me@example.test', name: 'Me', roles: ['editor'] }

  function lock(slug: string, lockedBy: string, expiresAt = LATER, locale = 'en'): ContentLock {
    return { collection: 'pages', slug, locale, lockedBy, lockedAt: EARLIER, expiresAt }
  }

  it('identifies the viewer as the API records them', () => {
    expect(ownLockIdentity(editor)).toBe('editor:me@example.test')
    expect(ownLockIdentity(null)).toBeNull()
  })

  it("does not count the viewer's own lock as foreign", () => {
    const held = foreignLocks([lock('about', 'editor:me@example.test')], 'en', editor, NOW)
    expect(held.size).toBe(0)
  })

  it("names another holder by email, without the API's role prefix", () => {
    const held = foreignLocks(
      [lock('about', 'admin:other@example.test'), lock('pricing', 'seeded@example.test')],
      'en',
      editor,
      NOW,
    )
    expect(held.get('pages/about')).toBe('other@example.test')
    expect(held.get('pages/pricing')).toBe('seeded@example.test')
    expect(lockHolderName('viewer:x@example.test')).toBe('x@example.test')
  })

  it('skips expired locks and locks in another locale', () => {
    const held = foreignLocks(
      [lock('old', 'other@example.test', EARLIER), lock('nb', 'other@example.test', LATER, 'nb')],
      'en',
      editor,
      NOW,
    )
    expect(held.size).toBe(0)
  })
})

describe('fetchAllDocuments', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** `count` documents behind an API capping each page at `cap`, read from `GET /api/content` */
  function installPagedApi(count: number, cap: number): string[] {
    const requests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://x')
      requests.push(`${url.pathname}${url.search}`)
      const limit = Math.min(Number(url.searchParams.get('limit')), cap)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const slugs = Array.from({ length: count }, (_, i) => `doc-${i}`).slice(
        offset,
        offset + limit,
      )
      const items = slugs.map((slug) => ({ meta: { slug }, fields: {} }))
      return json({ items, hasMore: offset + items.length < count })
    })
    return requests
  }

  it('reads every page when the API caps pages below the requested size', async () => {
    installPagedApi(130, 50)
    const items = await fetchAllDocuments()
    expect(items).toHaveLength(130)
    expect(items.at(-1)?.meta.slug).toBe('doc-129')
  })

  it('reads on while the API reports another page, in pages of 500', async () => {
    const requests = installPagedApi(1200, 1000)
    expect(await fetchAllDocuments()).toHaveLength(1200)
    expect(requests).toHaveLength(3)
    for (const request of requests) expect(request).toContain('limit=500')
  })

  it('reads every page once, with no skip and no repeat, when the API caps below the page size', async () => {
    const requests = installPagedApi(120, 50)
    const items = await fetchAllDocuments()
    expect(items.map((item) => item.meta.slug)).toEqual(
      Array.from({ length: 120 }, (_, i) => `doc-${i}`),
    )
    expect(requests).toHaveLength(3)
    expect(
      requests.map((request) => new URL(request, 'http://x').searchParams.get('offset')),
    ).toEqual(['0', '50', '100'])
  })

  it('stops on an empty page even when the API still reports hasMore', async () => {
    let asked = 0
    vi.stubGlobal('fetch', async () => {
      asked += 1
      return json({
        items: asked === 1 ? [{ meta: { slug: 'a' }, fields: {} }] : [],
        hasMore: true,
      })
    })
    expect(await fetchAllDocuments()).toHaveLength(1)
    expect(asked).toBe(2)
  })

  it('reads GET /api/content, never a collection, as summaries by default', async () => {
    const requests = installPagedApi(10, 500)
    await fetchAllDocuments()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatch(/^\/api\/content\?/)
    expect(requests[0]).toContain('view=summary')
  })

  it('asks for meta alone when the caller needs nothing else', async () => {
    const requests = installPagedApi(10, 500)
    await fetchAllDocuments({ view: 'meta' })
    expect(requests[0]).toContain('view=meta')
  })

  it('passes the collections, locale and status on every page', async () => {
    const requests = installPagedApi(120, 50)
    await fetchAllDocuments({ collections: ['pages', 'services'], locale: 'nb', status: 'draft' })
    expect(requests.length).toBeGreaterThan(1)
    for (const request of requests) {
      const params = new URL(request, 'http://x').searchParams
      expect(params.get('collections')).toBe('pages,services')
      expect(params.get('locale')).toBe('nb')
      expect(params.get('status')).toBe('draft')
    }
  })
})

describe('safe links', () => {
  it('links to an http(s) URL or a path on this site, never to a script or another scheme', () => {
    expect(safeHref('https://example.test/a')).toBe('https://example.test/a')
    expect(safeHref('http://example.test/')).toBe('http://example.test/')
    expect(safeHref('/media/a.png')).toBe('/media/a.png')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('//evil.test/a')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref(undefined)).toBeNull()
  })

  it('knows a plain object from null and an array', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord(true)).toBe(false)
  })
})
