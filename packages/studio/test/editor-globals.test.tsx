import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GLOBAL_BANNER } from '../src/editor/globals-editor.js'
import { type Version, versionRoutes } from './fixtures/data-api.js'
import {
  type FakeDoc,
  header,
  memoryStorage,
  type StoreOptions,
  storeRoutes,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { type FakeOptions, installApi, json, type Route, renderAt } from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const GLOBALS = 'globals'

/** The footer global: v3 saved, v2 live */
function footerDoc(): FakeDoc {
  return { slug: 'footer', version: 3, liveVersion: 2, fields: { title: 'Footer' } }
}

const VERSIONS: Version[] = [
  { version: 3, title: 'Footer' },
  { version: 2, title: 'Old footer' },
]

interface OpenOptions extends Partial<Omit<StoreOptions, 'doc' | 'collection'>> {
  doc?: FakeDoc | undefined
  query?: string | undefined
  role?: FakeOptions['role']
  routes?: Record<string, Route> | undefined
}

/** Open the footer global at `/layout/footer` */
function openGlobal(options: OpenOptions = {}): ReturnType<typeof installApi> {
  const doc = options.doc ?? footerDoc()
  const calls = installApi({
    role: options.role,
    routes: {
      ...storeRoutes({ ...options, doc, collection: GLOBALS }),
      ...versionRoutes(() => VERSIONS, { collection: GLOBALS, slug: doc.slug }),
      ...options.routes,
    },
  })
  renderAt(`/layout/${doc.slug}${options.query ?? ''}`)
  return calls
}

async function canvas(): Promise<HTMLElement> {
  return screen.findByRole('tabpanel')
}

async function card(name: string): Promise<HTMLElement> {
  return within(await canvas()).findByRole('region', { name })
}

describe('globals: the header', () => {
  it('has Fields and Where it appears — no Live, no Data, no Open on site — with Save draft and Publish', async () => {
    openGlobal()
    const bar = await header()
    expect(
      within(bar)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Fields', 'Where it appears'])
    expect(within(bar).getByRole('tab', { name: 'Fields' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(bar).queryByRole('tab', { name: 'Live' })).toBeNull()
    expect(within(bar).queryByRole('tab', { name: 'Data' })).toBeNull()
    expect(within(bar).queryByRole('link', { name: /Open on site/ })).toBeNull()
    expect(within(bar).getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Footer')
  })

  it('moves between the modes with the arrow keys, one tab in the Tab order, and keeps the mode in the address', async () => {
    openGlobal()
    const bar = await header()
    const fields = within(bar).getByRole('tab', { name: 'Fields' })
    const where = within(bar).getByRole('tab', { name: 'Where it appears' })
    expect(fields).toHaveAttribute('tabindex', '0')
    expect(where).toHaveAttribute('tabindex', '-1')
    const user = userEvent.setup()
    fields.focus()
    await user.keyboard('{ArrowRight}')
    expect(where).toHaveFocus()
    expect(where).toHaveAttribute('aria-selected', 'true')
    expect(where).toHaveAttribute('tabindex', '0')
    expect(await screen.findByRole('note')).toHaveTextContent(GLOBAL_BANNER)
    await user.keyboard('{ArrowRight}')
    expect(fields).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'title' })).toBeVisible()
  })

  it.each(['live', 'data', 'nope'])('falls back to Fields for ?mode=%s', async (mode) => {
    openGlobal({ query: `?mode=${mode}` })
    const bar = await header()
    expect(within(bar).getByRole('tab', { name: 'Fields' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('textbox', { name: 'title' })).toHaveValue('Footer')
  })
})

describe('globals: Where it appears', () => {
  it('shows the banner, verbatim, as a note — not an alert', async () => {
    openGlobal({ query: '?mode=where' })
    const note = await within(await canvas()).findByRole('note')
    expect(note).toHaveTextContent(GLOBAL_BANNER)
    expect(GLOBAL_BANNER).toBe(
      'A global has no page of its own. Publishing it marks every page that reads it stale; they refresh as visitors open them.',
    )
    expect(within(await canvas()).queryByRole('alert')).toBeNull()
  })

  it('states the rule for the pages that read it, with no list and no count krantho does not have', async () => {
    const calls = openGlobal({ query: '?mode=where' })
    const readers = await card('Pages that read it')
    expect(await within(readers).findByText(/^Every page that reads it\./)).toBeVisible()
    expect(within(readers).queryByRole('list')).toBeNull()
    expect(readers).not.toHaveTextContent(/cached entr/)
    expect(readers).not.toHaveTextContent(/\d+ pages?\b/)
    expect(
      calls.find((c) => c.key === 'GET /api/content/globals/footer/publish-impact')?.search,
    ).toBe('?locale=en')
  })

  it('gives the cached-entry count only when the API knows it, never as a count of pages', async () => {
    openGlobal({ query: '?mode=where', cachedEntries: 12 })
    const readers = await card('Pages that read it')
    expect(await within(readers).findByText(/^12 cached entries/)).toHaveTextContent(
      'not a count of pages',
    )
  })

  it('lists page paths only when the API names them', async () => {
    openGlobal({
      query: '?mode=where',
      routes: {
        'GET /api/content/globals/footer/publish-impact': () =>
          json({
            collection: GLOBALS,
            slug: 'footer',
            locale: 'en',
            paths: ['/footer'],
            lists: [GLOBALS],
            everyPageReading: false,
            caching: 'none',
            tags: [],
            cachedEntries: null,
          }),
      },
    })
    const readers = await card('Pages that read it')
    const list = await within(readers).findByRole('list', {
      name: 'The pages publishing refreshes',
    })
    expect(within(list).getByText('/footer')).toBeVisible()
    expect(readers).not.toHaveTextContent('Every page that reads it')
  })

  it('says when what it refreshes could not be read', async () => {
    openGlobal({
      query: '?mode=where',
      routes: {
        'GET /api/content/globals/footer/publish-impact': () => json({ error: 'Broken' }, 500),
      },
    })
    const readers = await card('Pages that read it')
    expect(await within(readers).findByText('Which pages read it could not be read.')).toBeVisible()
  })
})

describe('globals: history', () => {
  it('lists the versions of the locale being edited, with Diff', async () => {
    const calls = openGlobal({ query: '?mode=where' })
    const history = await card('History')
    const list = await within(history).findByRole('list', { name: 'Versions' })
    const [v3, v2] = within(list).getAllByRole('listitem')
    expect(v3).toHaveTextContent('current')
    expect(v2).toHaveTextContent('live')
    expect(calls.find((c) => c.key === 'GET /api/content/globals/footer/versions')?.search).toBe(
      '?locale=en',
    )
    await userEvent
      .setup()
      .click(
        within(v3 as HTMLElement).getByRole('button', { name: 'Diff v3 with the version before' }),
      )
    expect(await within(history).findByRole('heading', { name: 'v2 → v3' })).toHaveFocus()
  })

  it('restores a version as a new one, for an admin', async () => {
    const versions: Version[] = [...VERSIONS]
    const doc = footerDoc()
    const calls = openGlobal({
      doc,
      role: 'admin',
      query: '?mode=where',
      routes: {
        ...versionRoutes(() => versions, { collection: GLOBALS, slug: 'footer' }),
        'POST /api/content/globals/footer/restore/2': () => {
          doc.version += 1
          versions.unshift({ version: doc.version, title: 'Old footer' })
          return json({ restoredVersion: 2, version: doc.version, liveVersion: doc.liveVersion })
        },
      },
    })
    const history = await card('History')
    const user = userEvent.setup()
    await user.click(await within(history).findByRole('button', { name: 'Restore v2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore v2?' })
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/content/globals/footer/restore/2')).toBe(true),
    )
    expect(await within(history).findByText('v4')).toBeVisible()
  })
})

describe('globals: Publish', () => {
  it('confirms as for a page, says it refreshes every page that reads it, and makes the version live', async () => {
    const calls = openGlobal()
    const bar = await header()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish footer v3?' })
    expect(dialog).toHaveTextContent('Visitors see v2 now and will see v3.')
    expect(
      await within(dialog).findByText('every page that reads it, as visitors open them'),
    ).toBeVisible()
    expect(dialog).not.toHaveTextContent(/the page \//)
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/content/globals/footer/publish')).toBe(true),
    )
    expect(await within(bar).findByRole('button', { name: 'Live' })).toBeVisible()
  })
})
