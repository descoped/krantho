import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Studio } from '../src/routes.js'

// ---------------------------------------------------------------------------
// A fake API with every Pulse source; each test turns capabilities off or breaks a source
// ---------------------------------------------------------------------------

const ALL_FEATURES = {
  seo: 'enabled',
  webhookDeliveries: 'enabled',
  localization: 'enabled',
}

const COLLECTIONS = [
  { name: 'pages', source: 'database', pages: true },
  { name: 'globals', source: 'database', pages: false },
]

const SAVED_AT = new Date(Date.now() - 5 * 60_000).toISOString()

/** about: live; pricing: unpublished changes and no meta description; footer: a global */
const DOCUMENTS = [
  {
    meta: { collection: 'pages', slug: 'about', locale: 'en', version: 2, liveVersion: 2 },
    fields: { title: 'About', 'meta-description': 'About us' },
  },
  {
    meta: { collection: 'pages', slug: 'pricing', locale: 'en', version: 3, liveVersion: 2 },
    fields: { title: 'Pricing', description: '' },
  },
  {
    meta: { collection: 'globals', slug: 'footer', locale: 'en', version: 1, liveVersion: 1 },
    fields: {},
  },
]

interface FakeOptions {
  features?: Record<string, string>
  /** Paths answered with a 500 */
  broken?: readonly string[]
  documents?: typeof DOCUMENTS
  /** No edit lock is held */
  noLocks?: boolean
  /** The site's locales as Setup › Locales holds them; English and Norwegian by default */
  locales?: readonly string[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function pageOf(documents: typeof DOCUMENTS, url: URL): Response {
  const locale = url.searchParams.get('locale')
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? documents.length)
  const own = documents.filter(({ meta }) => !locale || meta.locale === locale)
  const items = own
    .slice(offset, offset + limit)
    .map(({ meta, fields }) => ({ meta: { ...meta, createdAt: SAVED_AT }, fields }))
  return json({ items, hasMore: offset + limit < own.length })
}

const FIXED_ROUTES: Record<string, () => Response> = {
  'GET /api/auth/capabilities': () => json({ auth_mode: 'none', login_required: false }),
  'GET /api/collections': () => json({ collections: COLLECTIONS }),
  'GET /api/site-config': () =>
    json({
      site: {
        name: 'Fjord Studio',
        domain: 'fjord.example',
        defaultLocale: 'en',
        supportedLocales: ['en'],
      },
      cache: { pages: 'next-isr', shared: 'none' },
    }),
  'GET /api/locks': () =>
    json({
      locks: [
        {
          collection: 'pages',
          slug: 'about',
          locale: 'en',
          lockedBy: 'editor:kari@example.test',
          lockedAt: SAVED_AT,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    }),
  'GET /api/seo/findings': () =>
    json({
      pages: [
        {
          collection: 'pages',
          slug: 'about',
          path: '/about',
          readers: { google: { errors: 0, warnings: 0, info: 0 } },
          features: [{ reader: 'google', feature: 'Article', type: 'Article', eligible: true }],
        },
      ],
      readers: [],
    }),
  'GET /api/webhooks/deliveries': () =>
    json({
      deliveries: [
        {
          id: 1,
          url: 'https://hooks.example.test/build',
          event: 'publish',
          status: 500,
          attempts: 3,
          nextRetryAt: null,
          createdAt: SAVED_AT,
          deliveredAt: null,
        },
      ],
      total: 2,
    }),
  'GET /api/translations/status': () =>
    json({
      supportedLocales: ['en', 'no'],
      defaultLocale: 'en',
      collections: [
        {
          collection: 'pages',
          total: 1,
          items: [{ slug: 'about', locales: ['en'], missing: ['no'] }],
        },
      ],
    }),
}

function installApi(options: FakeOptions = {}): string[] {
  const calls: string[] = []
  const features = options.features ?? ALL_FEATURES
  const documents = options.documents ?? DOCUMENTS
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://studio.test')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    calls.push(key)
    if (options.broken?.includes(url.pathname)) return json({ error: 'Broken' }, 500)
    if (options.noLocks && key === 'GET /api/locks') return json({ locks: [] })
    if (key === 'GET /api/settings/locales') {
      const supportedLocales = options.locales ?? ['en', 'no']
      return json({ defaultLocale: 'en', supportedLocales, source: 'runtime' })
    }
    if (key === 'GET /api/capabilities') {
      return json({ persistence: 'sqlite', framework: 'next', authMode: 'none', features })
    }
    if (key === 'GET /api/content') return pageOf(documents, url)
    const route = FIXED_ROUTES[key]
    return route ? route() : json({ error: 'not found' }, 404)
  })
  return calls
}

function renderPulse(): void {
  render(<Studio makeRouter={(routes) => createMemoryRouter(routes, { initialEntries: ['/'] })} />)
}

async function attentionList(): Promise<HTMLElement> {
  const section = await screen.findByRole('region', { name: 'Needs attention' })
  return within(section).getByRole('list')
}

function figure(name: string): HTMLElement | null {
  return screen.queryByRole('figure', { name })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

describe('Pulse with every source', () => {
  it('shows the site, its framework and page-cache mode, and New page', async () => {
    installApi()
    renderPulse()
    expect(await screen.findByRole('heading', { level: 1, name: 'Fjord Studio' })).toBeVisible()
    const facts = screen.getByText('fjord.example').closest('dl') as HTMLElement
    expect(facts).toHaveTextContent('Domainfjord.example')
    expect(facts).toHaveTextContent('FrameworkNext.js')
    expect(facts).toHaveTextContent('Page cachenext-isr')
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'New page' }),
    ).toHaveAttribute('href', '/new/pages')
  })

  it('counts the key figures from the sources, with no cached-pages figure', async () => {
    installApi()
    renderPulse()
    const live = await screen.findByRole('figure', { name: 'Live pages' })
    expect(within(live).getByText('2', { exact: true })).toBeInTheDocument()
    expect(live).toHaveTextContent('1 with unpublished changes')
    const meta = screen.getByRole('figure', { name: 'Meta descriptions' })
    expect(within(meta).getByText('1', { exact: true })).toBeInTheDocument()
    expect(meta).toHaveTextContent('0 fall back to description · 1 missing')
    const structured = screen.getByRole('figure', { name: 'Valid structured data' })
    expect(within(structured).getByText('1', { exact: true })).toBeInTheDocument()
    expect(structured).toHaveTextContent('Main types: Article')
    expect(screen.queryByText(/cached pages/i)).toBeNull()
  })

  it('lists a row with an action for every source', async () => {
    installApi()
    renderPulse()
    const list = await attentionList()
    const actions = within(list)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'))
    expect(actions).toEqual([
      'Open log: 2 webhook deliveries failed',
      'Open: About is being edited by kari@example.test',
      'Review: Pricing has unpublished changes',
      'Fix: Pricing has no meta description',
      'Locales: Pages: 1 document is missing a locale version',
    ])
  })

  it('shows the collections and the recent activity with event chips', async () => {
    installApi()
    renderPulse()
    const collections = await screen.findByRole('region', { name: 'Collections' })
    const pages = within(collections).getByRole('link', { name: /^Pages/ })
    expect(pages).toHaveAttribute('href', '/site/pages')
    expect(pages).toHaveTextContent('1 live')
    expect(pages).toHaveTextContent('1 draft ahead')
    expect(within(collections).queryByRole('link', { name: /^Layout|^Globals/ })).toBeNull()
    const activity = screen.getByRole('region', { name: 'Recent activity' })
    expect(within(activity).getAllByRole('listitem')).toHaveLength(3)
    expect(activity).toHaveTextContent('Draft saved')
    expect(activity).toHaveTextContent('Published')
    expect(activity).toHaveTextContent('5 minutes ago')
  })
})

describe('Pulse document reads', () => {
  it('reads every document from the one cross-collection list, never a collection', async () => {
    const calls = installApi()
    renderPulse()
    await screen.findByRole('figure', { name: 'Live pages' })
    expect(calls.filter((call) => call === 'GET /api/content')).toHaveLength(1)
    expect(calls.filter((call) => /^GET \/api\/content\/[a-z]+$/.test(call))).toEqual([])
  })
})

describe('Pulse with a capability off', () => {
  it('without seo: no structured-data figure, and the findings are never read', async () => {
    const calls = installApi({ features: { ...ALL_FEATURES, seo: 'disabled' } })
    renderPulse()
    await screen.findByRole('figure', { name: 'Live pages' })
    expect(figure('Valid structured data')).toBeNull()
    expect(calls).not.toContain('GET /api/seo/findings')
  })

  it('without webhookDeliveries: no failed-deliveries row, and the log is never read', async () => {
    const calls = installApi({ features: { ...ALL_FEATURES, webhookDeliveries: 'disabled' } })
    renderPulse()
    const list = await attentionList()
    expect(within(list).queryByText(/webhook deliveries failed/)).toBeNull()
    expect(within(list).getByText('Pricing has unpublished changes')).toBeInTheDocument()
    expect(calls).not.toContain('GET /api/webhooks/deliveries')
  })

  it('with one locale in Setup › Locales: no locale rows, and the coverage is never read', async () => {
    const calls = installApi({ locales: ['en'] })
    renderPulse()
    const list = await attentionList()
    expect(within(list).queryByText(/missing a locale version/)).toBeNull()
    expect(calls).not.toContain('GET /api/translations/status')
  })
})

describe('Pulse when a source fails or holds nothing', () => {
  it('says a figure is unavailable instead of counting zero', async () => {
    installApi({ broken: ['/api/seo/findings'] })
    renderPulse()
    const structured = await screen.findByRole('figure', { name: 'Valid structured data' })
    expect(structured).toHaveTextContent('Unavailable')
    expect(within(structured).queryByText('0', { exact: true })).toBeNull()
  })

  it('names the sources it could not check', async () => {
    installApi({ broken: ['/api/locks', '/api/webhooks/deliveries'] })
    renderPulse()
    const section = await screen.findByRole('region', { name: 'Needs attention' })
    expect(
      await within(section).findByText('Could not check edit locks or webhook deliveries.'),
    ).toBeInTheDocument()
  })

  it('reads calmly when nothing needs the editor', async () => {
    installApi({
      features: { seo: 'enabled' },
      documents: DOCUMENTS.slice(0, 1),
      noLocks: true,
      locales: ['en'],
    })
    renderPulse()
    const section = await screen.findByRole('region', { name: 'Needs attention' })
    expect(await within(section).findByText('Nothing needs you right now')).toBeInTheDocument()
    expect(section).toHaveTextContent(
      'Unpublished changes, edit locks and pages without a meta description show up here.',
    )
  })

  it('offers to try again when the documents cannot be read', async () => {
    installApi({ broken: ['/api/collections'] })
    renderPulse()
    // The shell's error toasts are an alert region too: find the one that speaks
    const lead = await screen.findByText(/Pulse could not load/)
    const alert = lead.closest('[role="alert"]') as HTMLElement
    expect(alert).toHaveTextContent('Pulse could not load')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
