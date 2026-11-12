import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Studio } from '../src/routes.js'

// ---------------------------------------------------------------------------
// A fake API: two collections and the globals, documents in each status, a foreign lock
// ---------------------------------------------------------------------------

interface Meta {
  collection: string
  slug: string
  locale: string
  version: number
  liveVersion: number | null
}

const DOCUMENTS: Meta[] = [
  { collection: 'pages', slug: 'about', locale: 'en', version: 2, liveVersion: 2 },
  { collection: 'pages', slug: 'pricing', locale: 'en', version: 3, liveVersion: 2 },
  { collection: 'services', slug: 'strategy', locale: 'en', version: 1, liveVersion: null },
  { collection: 'globals', slug: 'footer', locale: 'en', version: 1, liveVersion: 1 },
]

const COLLECTIONS = [
  { name: 'pages', source: 'database', pages: true, sections: [] },
  { name: 'services', source: 'database', pages: true, sections: [] },
  { name: 'hosts', source: 'database', pages: true, path: '/deploy/:slug', sections: [] },
  { name: 'faq', source: 'database', pages: false, path: false, sections: [] },
  { name: 'globals', source: 'database', pages: false, sections: [] },
]

/** When every fake document's current version was saved */
const SAVED_AT = '2026-10-01T10:00:00.000Z'

const FEATURES = { seo: 'enabled', media: 'local', checkpoints: 'enabled' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function listOf(collection: string): Response {
  const items = DOCUMENTS.filter((d) => d.collection === collection)
  return json({
    items: items.map((meta) => ({ meta: { ...meta, createdAt: SAVED_AT }, fields: {} })),
    hasMore: false,
  })
}

/** What `GET /api/content` answers: every document, as meta alone under `view=meta`, in one page */
function allOf(requested: string | undefined): Response {
  const view = new URL(requested ?? '', 'http://studio.test').searchParams.get('view')
  return json({
    items: DOCUMENTS.map((meta) => {
      const full = { ...meta, createdAt: SAVED_AT }
      return view === 'meta' ? full : { meta: full, fields: {} }
    }),
    hasMore: false,
  })
}

/** What `GET /api/content-tree` answers: every collection's documents as meta, no content */
function treeOf(): Response {
  return json({
    collections: COLLECTIONS.map(({ name }) => ({
      name,
      documents: DOCUMENTS.filter((d) => d.collection === name).map((meta) => ({
        ...meta,
        status: meta.liveVersion === null ? 'draft' : 'published',
        createdAt: SAVED_AT,
      })),
    })),
  })
}

/** What `GET /api/content/search` answers: `{ meta, fields, snippet }` items and `hasMore`, no body */
function searchOf(requested: string | undefined): Response {
  const term = (
    new URL(requested ?? '', 'http://studio.test').searchParams.get('q') ?? ''
  ).toLowerCase()
  const items = DOCUMENTS.filter((d) => `${d.collection}/${d.slug}`.includes(term)).map((meta) => ({
    meta: {
      ...meta,
      createdAt: SAVED_AT,
      status: meta.liveVersion === null ? 'draft' : 'published',
    },
    fields: meta.slug === 'pricing' ? { title: 'Plans and pricing' } : {},
    snippet: `…${term}…`,
  }))
  return json({ items, hasMore: false })
}

function installApi(defaultLocale = 'en'): { calls: string[]; urls: string[] } {
  const calls: string[] = []
  const urls: string[] = []
  const routes: Record<string, () => Response> = {
    'GET /api/settings/locales': () =>
      json({ defaultLocale, supportedLocales: [defaultLocale], source: 'runtime' }),
    'GET /api/auth/capabilities': () => json({ auth_mode: 'none', login_required: false }),
    'GET /api/capabilities': () =>
      json({
        persistence: 'sqlite',
        framework: 'next',
        authMode: 'none',
        schemaVersion: 1,
        features: FEATURES,
      }),
    'GET /api/collections': () => json({ collections: COLLECTIONS }),
    'GET /api/site-config': () =>
      json({
        site: {
          name: 'Shell',
          domain: 'shell.test',
          defaultLocale: 'en',
          supportedLocales: ['en'],
        },
        cache: { pages: 'none', shared: 'none' },
      }),
    'GET /api/locks': () =>
      json({
        locks: [
          {
            collection: 'pages',
            slug: 'pricing',
            locale: 'en',
            lockedBy: 'editor:other@example.test',
            lockedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      }),
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === 'string' ? input : input.toString()).split('?')[0] ?? ''
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url}`)
    urls.push(typeof input === 'string' ? input : input.toString())
    if (method === 'GET' && url === '/api/content-tree') return treeOf()
    if (method === 'GET' && url === '/api/content') return allOf(urls[urls.length - 1])
    if (method === 'GET' && url === '/api/content/search') return searchOf(urls[urls.length - 1])
    const list = url.match(/^\/api\/content\/([a-z]+)$/)
    if (method === 'GET' && list?.[1]) return listOf(list[1])
    const route = routes[`${method} ${url}`]
    return route ? route() : json({ error: 'not found' }, 404)
  })
  return { calls, urls }
}

function renderStudio(path = '/'): void {
  render(<Studio makeRouter={(routes) => createMemoryRouter(routes, { initialEntries: [path] })} />)
}

async function siteTree(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: 'Site tree' })
}

beforeEach(() => {
  installApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

describe('navigation', () => {
  it('lists the destinations in order', async () => {
    renderStudio()
    const list = await screen.findByRole('list', { name: 'Destinations' })
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Pulse', 'Site', 'Structure', 'Media', 'Setup'])
    expect(within(list).getByRole('link', { name: 'Pulse' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows a group per collection with a new entry, and a Layout group without one', async () => {
    renderStudio()
    const tree = await siteTree()
    const pages = await within(tree).findByRole('group', { name: 'Pages' })
    expect(within(pages).getByRole('link', { name: 'New page' })).toHaveAttribute(
      'href',
      '/new/pages',
    )
    const services = within(tree).getByRole('group', { name: 'Services' })
    expect(within(services).getByRole('link', { name: 'New service' })).toBeInTheDocument()
    const layout = within(tree).getByRole('group', { name: 'Layout' })
    expect(await within(layout).findByRole('link', { name: /footer/ })).toHaveAttribute(
      'href',
      '/layout/footer',
    )
    expect(within(layout).queryByRole('link', { name: /^New / })).toBeNull()
  })

  it('reads the tree as meta alone, in one request, never the documents of a collection', async () => {
    const { calls } = installApi()
    renderStudio()
    await siteTree()
    await waitFor(() => expect(calls).toContain('GET /api/content-tree'))
    expect(calls.some((call) => call.startsWith('GET /api/content/'))).toBe(false)
  })

  describe('refreshing', () => {
    const setVisibility = (state: 'visible' | 'hidden'): void => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    }
    afterEach(() => {
      vi.useRealTimers()
      setVisibility('visible')
    })

    it('refreshes every minute while the tab is in view, and reads nothing while it is out of view', async () => {
      const { calls } = installApi()
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      renderStudio()
      await siteTree()
      const reads = (): number => calls.filter((call) => call === 'GET /api/content-tree').length
      await waitFor(() => expect(reads()).toBeGreaterThan(0))
      const initial = reads()

      await vi.advanceTimersByTimeAsync(60_000)
      await waitFor(() => expect(reads()).toBe(initial + 1))

      setVisibility('hidden')
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(reads()).toBe(initial + 1)

      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(reads()).toBe(initial + 2))
    })

    it('stops after ten minutes without interaction, and reads once on the next one', async () => {
      const { calls } = installApi()
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      renderStudio()
      await siteTree()
      const reads = (): number => calls.filter((call) => call === 'GET /api/content-tree').length
      await waitFor(() => expect(reads()).toBeGreaterThan(0))

      // Activity keeps it going: a pointer move every few minutes is someone there
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      document.dispatchEvent(new Event('pointermove'))
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      await waitFor(() => expect(reads()).toBeGreaterThan(5))

      // Left alone, it reads until the limit and then no more
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      const atLimit = reads()
      await vi.advanceTimersByTimeAsync(30 * 60_000)
      expect(reads()).toBe(atLimit)

      // Someone is back: one read at once, and the minute timer carries on
      document.dispatchEvent(new Event('keydown'))
      await waitFor(() => expect(reads()).toBe(atLimit + 1))
      await vi.advanceTimersByTimeAsync(60_000)
      await waitFor(() => expect(reads()).toBe(atLimit + 2))
    })
  })

  it('reads the tree in the default locale set in Setup › Locales', async () => {
    const { urls } = installApi('nb')
    renderStudio()
    await siteTree()
    await waitFor(() =>
      expect(
        urls.some((url) => url.startsWith('/api/content-tree?') && url.includes('locale=nb')),
      ).toBe(true),
    )
    expect(urls.some((url) => url.includes('locale=en'))).toBe(false)
  })

  it('tells the statuses apart by shape: filled, half-filled, ring', async () => {
    renderStudio()
    const legend = await screen.findByRole('list', { name: 'Status legend' })
    const dots = [...legend.querySelectorAll('.ui-status-dot')].map((dot) => dot.className)
    expect(dots).toEqual([
      'ui-status-dot ui-status-dot--live',
      'ui-status-dot ui-status-dot--ahead',
      'ui-status-dot ui-status-dot--draft',
    ])
    expect(legend).toHaveTextContent('live')
    expect(legend).toHaveTextContent('draft ahead')
  })

  it('labels each group with the URL path its pages live at', async () => {
    renderStudio()
    const tree = await siteTree()
    const label = (group: string): string | null | undefined =>
      within(within(tree).getByRole('group', { name: group })).getAllByRole('link')[0]?.textContent
    await within(tree).findByRole('group', { name: 'Hosts' })
    expect(label('Pages')).toBe('Pages /')
    expect(label('Services')).toBe('Services /services')
    expect(label('Hosts')).toBe('Hosts /deploy')
    // A collection without pages has no URL path
    expect(label('Faq')).toBe('Faq')
  })

  it('marks each document with its status and a foreign lock', async () => {
    renderStudio()
    const tree = await siteTree()
    const about = await within(tree).findByRole('link', { name: /about/ })
    expect(within(about).getByRole('img', { name: 'Live' })).toBeInTheDocument()
    const pricing = within(tree).getByRole('link', { name: /pricing/ })
    expect(within(pricing).getByRole('img', { name: 'Unpublished changes' })).toBeInTheDocument()
    expect(
      within(pricing).getByRole('img', { name: 'Locked by other@example.test' }),
    ).toBeInTheDocument()
    const strategy = await within(tree).findByRole('link', { name: /strategy/ })
    expect(within(strategy).getByRole('img', { name: 'Not published' })).toBeInTheDocument()
    expect(within(about).queryByRole('img', { name: /Locked/ })).toBeNull()
  })

  it('collapses a group and hides its documents', async () => {
    const user = userEvent.setup()
    renderStudio()
    const tree = await siteTree()
    await within(tree).findByRole('link', { name: /about/ })
    const toggle = within(tree).getByRole('button', { name: 'Pages documents' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(tree).queryByRole('link', { name: /about/ })).toBeNull()
  })

  it('collapses to icons and expands again', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.queryByRole('group', { name: 'Site tree' })).toBeNull()
    // The labels stay the destinations' names
    expect(screen.getByRole('link', { name: 'Structure' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(await siteTree()).toBeInTheDocument()
  })

  it('is resized with its handle, and the width is remembered', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size
      },
    })
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    const handle = screen.getByRole('separator', { name: 'Resize navigation' })
    handle.focus()
    await user.keyboard('{ArrowRight}')
    expect(handle).toHaveAttribute('aria-valuenow', '252')
    expect(document.querySelector('.shell')).toHaveStyle({ '--nav-width': '252px' })
    expect(JSON.parse(storage.get('krantho-studio-nav') ?? '{}')).toMatchObject({ width: 252 })
    // Collapsed to icons, there is no edge to drag
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.queryByRole('separator', { name: 'Resize navigation' })).toBeNull()
  })

  it('marks the open collection group as current', async () => {
    renderStudio('/site/pages')
    const tree = await siteTree()
    const heads = await within(tree).findAllByRole('link', { name: /^Pages/ })
    const current = heads.filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveClass('tree-group-label')
  })

  it('dismisses a collapsed tooltip with Esc and keeps focus', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    const link = screen.getByRole('link', { name: 'Structure' })
    link.focus()
    expect(link).not.toHaveAttribute('data-tip-dismissed')
    await user.keyboard('{Escape}')
    expect(link).toHaveAttribute('data-tip-dismissed')
    expect(link).toHaveFocus()
    // Leaving the item re-arms its tooltip
    screen.getByRole('link', { name: 'Media' }).focus()
    expect(link).not.toHaveAttribute('data-tip-dismissed')
  })

  it('sets the theme from the radio group', async () => {
    const user = userEvent.setup()
    renderStudio()
    const theme = await screen.findByRole('radiogroup', { name: 'Theme' })
    await user.click(within(theme).getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(within(theme).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.keyboard('{ArrowRight}')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
  })

  it('shows the breadcrumbs of the route with decorative separators', async () => {
    renderStudio('/structure/rich-results')
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Structure', 'Rich results'])
    for (const svg of crumbs.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
  })
})

describe('command palette', () => {
  it('opens with Ctrl+K and lists the commands the site allows', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    expect(within(palette).getByRole('combobox')).toHaveFocus()
    const commands = within(palette).getByRole('listbox', { name: 'Commands' })
    await waitFor(() => expect(within(commands).getAllByRole('option')).toHaveLength(5))
    expect(
      within(commands)
        .getAllByRole('option')
        .map((option) => option.querySelector('.palette-option-label')?.textContent),
    ).toEqual([
      'New page',
      'Publish all drafts ahead of live',
      'Create checkpoint',
      'Enrich missing SEO',
      'Structure',
    ])
  })

  it('moves with the arrow keys and closes with Esc, returning focus', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    const button = screen.getByRole('button', { name: 'Search or command' })
    await user.click(button)
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    const options = await within(palette).findAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    expect(button).toHaveFocus()
  })

  it('asks before publishing every draft ahead of live', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.click(
      await within(palette).findByRole('option', { name: /Publish all drafts ahead of live/ }),
    )
    const confirm = await screen.findByRole('dialog', { name: 'Publish all drafts ahead of live' })
    expect(confirm).toHaveTextContent('1 document has unpublished changes')
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(confirm).getByRole('button', { name: 'Publish 1 document' })).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the navigation drawer before it opens, so one focus trap is active', async () => {
    // A narrow viewport: the navigation is a drawer
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    const user = userEvent.setup()
    renderStudio()
    await user.click(await screen.findByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
    expect(
      within(screen.getByRole('dialog', { name: 'Command palette' })).getByRole('combobox'),
    ).toHaveFocus()
  })

  it('keeps focus inside the confirmation while it publishes', async () => {
    const apiFetch = globalThis.fetch
    // Publishing never answers: the dialog stays busy
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/bulk-publish')
        ? new Promise(() => undefined)
        : apiFetch(input, init),
    )
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.click(
      await within(palette).findByRole('option', { name: /Publish all drafts ahead of live/ }),
    )
    const confirm = await screen.findByRole('dialog', { name: 'Publish all drafts ahead of live' })
    const publish = within(confirm).getByRole('button', { name: 'Publish 1 document' })
    await user.click(publish)
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    expect(publish).toHaveTextContent('Publishing…')
    expect(publish).toHaveAttribute('aria-disabled', 'true')
    expect(confirm).toContainElement(document.activeElement as HTMLElement)
  })

  it('lists the documents a search answers from their meta and fields', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.type(within(palette).getByRole('combobox'), 'pag')
    const results = await within(palette).findByRole('listbox', { name: 'Documents' })
    await waitFor(() => expect(within(results).getAllByRole('option')).toHaveLength(2))
    const [about, pricing] = within(results).getAllByRole('option')
    expect(about).toHaveTextContent('about')
    expect(about).toHaveTextContent('Pages · about')
    expect(pricing).toHaveTextContent('Plans and pricing')
    expect(pricing).toHaveTextContent('Pages · pricing')
    expect(within(palette).getByRole('status')).toBeEmptyDOMElement()
  })

  it('asks for at least two characters before searching', async () => {
    const user = userEvent.setup()
    renderStudio()
    await siteTree()
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.type(within(palette).getByRole('combobox'), 'a')
    expect(within(palette).getByRole('status')).toHaveTextContent('Keep typing')
  })
})
