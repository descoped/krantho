import { act, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { Studio } from '../../src/routes.js'

// ---------------------------------------------------------------------------
// A fake Site API: pages and services, the globals, the findings and the locale versions
// ---------------------------------------------------------------------------

const ALL_FEATURES = { seo: 'enabled', localization: 'enabled' }

const COLLECTIONS = [
  { name: 'pages', source: 'database', pages: true, sections: [] },
  { name: 'services', source: 'database', pages: true, sections: [] },
  { name: 'globals', source: 'database', pages: false, sections: [] },
]

export interface Doc {
  meta: {
    collection: string
    slug: string
    locale: string
    version: number
    liveVersion: number | null
  }
  fields: Record<string, unknown>
  createdAt: string
}

/** about: live; pricing: unpublished changes; contact: not published; footer: a global */
export const DOCUMENTS: Doc[] = [
  {
    meta: { collection: 'pages', slug: 'about', locale: 'en', version: 2, liveVersion: 2 },
    fields: { title: 'About', 'meta-description': 'About us' },
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    meta: { collection: 'pages', slug: 'pricing', locale: 'en', version: 3, liveVersion: 2 },
    fields: { title: 'Pricing', description: 'What it costs' },
    createdAt: '2026-10-02T10:00:00.000Z',
  },
  {
    meta: { collection: 'pages', slug: 'contact', locale: 'en', version: 1, liveVersion: null },
    fields: { title: 'Contact' },
    createdAt: '2026-09-30T10:00:00.000Z',
  },
  {
    meta: { collection: 'globals', slug: 'footer', locale: 'en', version: 1, liveVersion: 1 },
    fields: { title: 'Footer' },
    createdAt: '2026-09-29T10:00:00.000Z',
  },
]

/** An answer to one `METHOD /path`, given the request's body and its URL (for the query) */
export type Route = (body: unknown, url: URL) => Response | Promise<Response>

export interface FakeOptions {
  features?: Record<string, string> | undefined
  broken?: readonly string[] | undefined
  role?: 'admin' | 'editor' | 'viewer' | undefined
  /** The documents the lists hold; the fixed set by default */
  documents?: readonly Doc[] | undefined
  /** Paths whose requests never answer — a screen that stays loading */
  pending?: readonly string[] | undefined
  /** More answers, by `METHOD /path`, ahead of the fixed ones */
  routes?: Readonly<Record<string, Route>> | undefined
}

interface Call {
  key: string
  body: unknown
  /** The query string, `?locale=no` or empty */
  search: string
}

/**
 * Every answer of the fake API waits this long when `KRANTHO_TEST_API_DELAY_MS` is set: a slow
 * server. A test whose result depends on how fast the server answers fails on every run, not
 * now and then on a loaded machine. CI runs Studio tests once with a delay.
 */
const API_DELAY_MS = Number(process.env['KRANTHO_TEST_API_DELAY_MS'] ?? 0)

// The requests the current fake API has taken and not yet answered, and all it has taken. Each
// install starts afresh, so a request left over from an earlier test counts for nothing.
let net = { pending: 0, taken: 0 }

/**
 * Resolves when the fake API has answered everything the screen asked and the screen has
 * drawn the answers, including what those answers set off (a render that asks again). It
 * yields to the event loop until nothing is in flight and nothing new was asked, so it
 * waits for exactly the work there is, however slow the machine. A request held with
 * `held` is not waited for until it is released.
 */
export async function settled(): Promise<void> {
  for (let quiet = 0; quiet < 2; ) {
    const before = net.taken
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    quiet = net.pending === 0 && net.taken === before ? quiet + 1 : 0
  }
}

/**
 * A route that does not answer until the test lets it. The test decides when the data a
 * screen waits for arrives, so what the screen shows before and after is asserted in
 * order, with no timing involved. `requested` settles when the screen has asked.
 */
export interface HeldRoute {
  route: Route
  /** Let the held request answer; later requests to the route answer at once */
  release: () => void
  /** Settles when the first request arrives */
  requested: Promise<void>
}

export function held(answer: Route): HeldRoute {
  let release: () => void = () => undefined
  let asked: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requested = new Promise<void>((resolve) => {
    asked = resolve
  })
  const route: Route = async (body, url) => {
    // The install that took this request, even if a later test has installed its own by the time
    // the request is released
    const taker = net
    asked()
    taker.pending -= 1
    await gate
    taker.pending += 1
    return answer(body, url)
  }
  return { route, release, requested }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Binary order, as the adapters compare text */
function compareBinary(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * One page of `documents` as `GET /api/content` answers it: the `collections` and `locale`
 * filters, ordered by collection, slug and locale, cut at `limit` from `offset`, `hasMore` set
 * when a row follows, and `view=meta` answering the bare meta
 */
function pageOf(documents: readonly Doc[], url: URL): Response {
  const names = (url.searchParams.get('collections') ?? '').split(',').filter(Boolean)
  const locale = url.searchParams.get('locale')
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? documents.length)
  const own = documents
    .filter(({ meta }) => names.length === 0 || names.includes(meta.collection))
    .filter(({ meta }) => !locale || meta.locale === locale)
    .sort(
      (a, b) =>
        compareBinary(a.meta.collection, b.meta.collection) ||
        compareBinary(a.meta.slug, b.meta.slug) ||
        compareBinary(a.meta.locale, b.meta.locale),
    )
  const items = own.slice(offset, offset + limit).map(({ meta, fields, createdAt }) => {
    const full = { ...meta, createdAt }
    return url.searchParams.get('view') === 'meta' ? full : { meta: full, fields }
  })
  return json({ items, hasMore: offset + limit < own.length })
}

function listOf(collection: string, documents: readonly Doc[]): Response {
  const items = documents
    .filter(({ meta }) => meta.collection === collection)
    .map(({ meta, fields, createdAt }) => ({ meta: { ...meta, createdAt }, fields }))
  return json({ items, hasMore: false })
}

const FIXED_ROUTES: Record<string, () => Response> = {
  'GET /api/collections': () => json({ collections: COLLECTIONS }),
  'GET /api/locks': () => json({ locks: [] }),
  'GET /api/site-config': () =>
    json({
      site: {
        name: 'Fjord Studio',
        domain: 'fjord.example',
        baseUrl: 'https://fjord.example',
        defaultLocale: 'en',
        supportedLocales: ['en', 'no'],
      },
      seo: {
        limits: { metaDescription: { minChars: 120, maxChars: 155 }, title: { maxChars: 60 } },
        readers: ['google'],
      },
      cache: { pages: 'none', shared: 'none' },
    }),
  'GET /api/settings/locales': () =>
    json({
      defaultLocale: 'en',
      configuredLocales: ['en', 'no'],
      supportedLocales: ['en', 'no'],
      source: 'config',
    }),
  'GET /api/seo/findings': () =>
    json({
      pages: [
        {
          collection: 'pages',
          slug: 'about',
          path: '/about',
          readers: { google: { errors: 0, warnings: 0, info: 0 } },
          features: [],
        },
        {
          collection: 'pages',
          slug: 'pricing',
          path: '/pricing',
          readers: { google: { errors: 1, warnings: 0, info: 0 } },
          features: [],
        },
      ],
      readers: [],
    }),
  'GET /api/translations/status': () =>
    json({
      supportedLocales: ['en', 'no'],
      defaultLocale: 'en',
      collections: [
        {
          collection: 'pages',
          total: 3,
          items: [
            { slug: 'about', locales: ['en', 'no'], missing: [] },
            { slug: 'pricing', locales: ['en'], missing: ['no'] },
            { slug: 'contact', locales: ['en'], missing: ['no'] },
          ],
        },
      ],
    }),
  'POST /api/content/pages/bulk-publish': () =>
    json({ results: [{ slug: 'pricing', published: true }], published: 1 }),
  'DELETE /api/content/pages/bulk': () =>
    json({ results: [{ slug: 'contact', deleted: true }], deleted: 1 }),
  'POST /api/content/pages/import': () =>
    json({
      collection: 'pages',
      imported: 1,
      total: 1,
      results: [{ slug: 'new', imported: true }],
    }),
}

function authRoutes(role: FakeOptions['role']): Record<string, () => Response> {
  if (!role)
    return {
      'GET /api/auth/capabilities': () => json({ auth_mode: 'none', login_required: false }),
    }
  return {
    'GET /api/auth/capabilities': () => json({ auth_mode: 'token', login_required: true }),
    'GET /api/auth/me': () => json({ email: 'person@example.test', roles: [role] }),
  }
}

export function installApi(options: FakeOptions = {}): Call[] {
  const calls: Call[] = []
  const mine = { pending: 0, taken: 0 }
  net = mine
  const features = options.features ?? ALL_FEATURES
  const routes = { ...FIXED_ROUTES, ...authRoutes(options.role) }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://studio.test')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ key, body, search: url.search })
    mine.taken += 1
    mine.pending += 1
    try {
      return await answer(key, url, body)
    } finally {
      mine.pending -= 1
    }
  })
  return calls

  async function answer(key: string, url: URL, body: unknown): Promise<Response> {
    if (API_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS))
    const extra = options.routes?.[key]
    if (extra) return extra(body, url)
    if (options.pending?.includes(url.pathname)) {
      mine.pending -= 1
      return new Promise<Response>(() => undefined)
    }
    if (options.broken?.includes(url.pathname)) return json({ error: 'Broken' }, 500)
    if (key === 'GET /api/capabilities') {
      return json({ persistence: 'sqlite', framework: 'next', authMode: 'none', features })
    }
    if (key === 'GET /api/content') return pageOf(options.documents ?? DOCUMENTS, url)
    const list = url.pathname.match(/^\/api\/content\/([a-z]+)$/)
    if (key.startsWith('GET') && list?.[1]) return listOf(list[1], options.documents ?? DOCUMENTS)
    const route = routes[key]
    return route ? route() : json({ error: 'not found' }, 404)
  }
}

export function renderAt(path: string): void {
  render(<Studio makeRouter={(routes) => createMemoryRouter(routes, { initialEntries: [path] })} />)
}

export function main(): ReturnType<typeof within> {
  return within(screen.getByRole('main'))
}

export async function findMain(): Promise<ReturnType<typeof within>> {
  return within(await screen.findByRole('main'))
}

export function headers(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent ?? '')
}
