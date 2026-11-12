import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aheadDoc,
  contentOf,
  header,
  KEPT_REGION,
  memoryStorage,
  openEditor,
  storeRoutes,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { installApi, json, type Route, renderAt } from './fixtures/site-api.js'

const NEW_KEY = 'krantho-autosave-new-pages'

/** Longer than the editor waits after a change before it keeps the work */
const pastKeeping = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1000))

/** The store, with a page at `fresh-page` once the editor creates it */
function installNewStore(): ReturnType<typeof installApi> {
  let created = false
  const fresh = { slug: 'fresh-page', version: 1, liveVersion: null, fields: { title: 'Fresh' } }
  return installApi({
    routes: {
      ...storeRoutes({ doc: aheadDoc() }),
      'GET /api/content/pages/fresh-page': () =>
        created ? json(contentOf(fresh)) : json({ error: 'Not found' }, 404),
      'POST /api/content/pages/fresh-page/lock': () => json({ locked: true }),
      'GET /api/content/pages/fresh-page/versions': () => json({ versions: [] }),
      'POST /api/content/pages': () => {
        created = true
        return json({ slug: 'fresh-page', version: 1, liveVersion: null }, 201)
      },
    },
  })
}

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a new document', () => {
  it('keeps the work with its slug, offers it back, and clears it once created', async () => {
    const calls = installNewStore()
    renderAt('/new/pages')
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'title' }), 'Fresh page')
    expect(screen.getByRole('textbox', { name: 'slug' })).toHaveValue('fresh-page')
    await pastKeeping()
    expect(JSON.parse(localStorage.getItem(NEW_KEY) ?? '{}')).toMatchObject({
      fields: { title: 'Fresh page' },
      slug: 'fresh-page',
    })

    const nav = screen.getByRole('navigation', { name: 'Studio' })
    await user.click(within(nav).getByRole('link', { name: 'Pulse' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(dialog).toHaveTextContent(
      'Your changes to the new document are not saved. They stay in this browser',
    )

    cleanup()
    renderAt('/new/pages')
    const notice = await screen.findByRole('region', { name: KEPT_REGION })
    await user.click(within(notice).getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Fresh page')
    expect(screen.getByRole('textbox', { name: 'slug' })).toHaveValue('fresh-page')

    await user.click(within(await header()).getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'POST /api/content/pages')?.body).toMatchObject({
        slug: 'fresh-page',
        fields: { title: 'Fresh page' },
      }),
    )
    await pastKeeping()
    expect(localStorage.getItem(NEW_KEY)).toBeNull()
  })

  it('holds the form while it creates, then opens the created document without asking to leave', async () => {
    let answer = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      answer = resolve
    })
    let created = false
    const fresh = { slug: 'fresh-page', version: 1, liveVersion: null, fields: { title: 'Fresh' } }
    installApi({
      routes: {
        ...storeRoutes({ doc: aheadDoc() }),
        'GET /api/content/pages/fresh-page': () =>
          created ? json(contentOf(fresh)) : json({ error: 'Not found' }, 404),
        'POST /api/content/pages/fresh-page/lock': () => json({ locked: true }),
        'GET /api/content/pages/fresh-page/versions': () => json({ versions: [] }),
        'POST /api/content/pages': async () => {
          await gate
          created = true
          return json({ slug: 'fresh-page', version: 1, liveVersion: null }, 201)
        },
      },
    })
    renderAt('/new/pages')
    const user = userEvent.setup()
    const title = await screen.findByRole('textbox', { name: 'title' })
    await user.type(title, 'Fresh page')
    await user.click(within(await header()).getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Creating the document…')).toBeInTheDocument()
    expect(title).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'slug' })).toBeDisabled()
    answer()
    // The created document's editor: saved, named by its slug, with no slug to type
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'slug' })).toBeNull())
    expect(await screen.findByRole('heading', { level: 1, name: 'fresh-page' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull()
    // It was made in Structure mode, and stays there rather than opening Live
    expect(within(await header()).getByRole('tab', { name: 'Structure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('refuses a slug the collection already holds, on the slug field, without creating', async () => {
    const calls = installNewStore()
    renderAt('/new/pages')
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'title' }), 'Pricing')
    await user.click(within(await header()).getByRole('button', { name: 'Save draft' }))
    const slug = screen.getByRole('textbox', { name: 'slug' })
    await waitFor(() => expect(slug).toHaveAttribute('aria-invalid', 'true'))
    expect(slug).toHaveAccessibleDescription(
      expect.stringContaining('pages already has a document at "pricing". Choose another slug.'),
    )
    expect(calls.some((call) => call.key === 'POST /api/content/pages')).toBe(false)
  })
})

/** The NO version's answers, in turn: missing (404), there, failing (500) or never answering */
type NoAnswer = 'missing' | 'exists' | 'fail' | 'pending'

function noVersion(answers: readonly NoAnswer[]): Route {
  let asked = 0
  const there = contentOf({ slug: 'pricing', version: 1, liveVersion: null, fields: {} })
  return (_body, url) => {
    if (url.searchParams.get('locale') !== 'no') return json(contentOf(aheadDoc()))
    const answer = answers[Math.min(asked, answers.length - 1)]
    asked += 1
    if (answer === 'pending') return new Promise<Response>(() => undefined)
    if (answer === 'fail') return json({ error: 'Broken' }, 500)
    if (answer === 'exists')
      return json({ ...there, meta: { ...(there.meta as object), locale: 'no' } })
    return json({ error: 'Not found' }, 404)
  }
}

function openWithNo(answers: readonly NoAnswer[]): ReturnType<typeof installApi> {
  return openEditor(
    { doc: aheadDoc() },
    { routes: { 'GET /api/content/pages/pricing': noVersion(answers) } },
  )
}

async function createNo(): Promise<HTMLElement> {
  const bar = await header()
  const user = userEvent.setup()
  await user.click(await within(bar).findByRole('button', { name: 'Create NO draft' }))
  const dialog = await screen.findByRole('dialog', { name: 'Create the NO draft of pricing?' })
  await user.click(within(dialog).getByRole('button', { name: 'Create draft' }))
  return dialog
}

const posted = (calls: ReturnType<typeof installApi>): unknown[] =>
  calls.filter((call) => call.key === 'POST /api/content/pages').map((call) => call.body)

describe('creating a locale version', () => {
  it('copies the default locale’s version into a new draft', async () => {
    const calls = openWithNo(['missing'])
    await createNo()
    await waitFor(() =>
      expect(posted(calls)).toEqual([
        expect.objectContaining({
          slug: 'pricing',
          locale: 'no',
          fields: expect.objectContaining({ title: 'Pricing' }),
        }),
      ]),
    )
  })

  it('refuses when the version was created meanwhile', async () => {
    const calls = openWithNo(['missing', 'exists'])
    const dialog = await createNo()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The NO version of pricing exists now',
    )
    expect(posted(calls)).toEqual([])
  })

  it('returns focus to the chip that replaced the "+" when the refused dialog closes', async () => {
    openWithNo(['missing', 'exists'])
    const dialog = await createNo()
    await within(dialog).findByRole('alert')
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const group = within(await header()).getByRole('group', { name: 'Locales' })
    await waitFor(() =>
      expect(within(group).getByRole('link', { name: 'NO version' })).toHaveFocus(),
    )
  })

  it('returns focus to the locales when the refused dialog closes on a chip that cannot take it', async () => {
    openWithNo(['missing', 'fail'])
    const dialog = await createNo()
    await within(dialog).findByRole('alert')
    await userEvent.setup().keyboard('{Escape}')
    const group = within(await header()).getByRole('group', { name: 'Locales' })
    await waitFor(() => expect(group).toHaveFocus())
  })

  it('refuses when it cannot check, and says so', async () => {
    const calls = openWithNo(['missing', 'fail'])
    const dialog = await createNo()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not check whether the NO version of pricing exists, so nothing was created.',
    )
    expect(posted(calls)).toEqual([])
  })

  it('offers no "+" for a version it could not check', async () => {
    openWithNo(['fail'])
    const group = await within(await header()).findByRole('group', { name: 'Locales' })
    expect(await within(group).findByText(/could not be checked/)).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: 'Create NO draft' })).toBeNull()
  })

  it('shows a locale it is still checking as neither a link nor a button, so nothing swaps under focus', async () => {
    openWithNo(['pending'])
    const group = await within(await header()).findByRole('group', { name: 'Locales' })
    expect(within(group).getByRole('link', { name: 'EN version' })).toBeInTheDocument()
    expect(within(group).getByText('NO')).toBeInTheDocument()
    expect(within(group).queryByRole('link', { name: 'NO version' })).toBeNull()
    expect(within(group).queryByRole('button', { name: 'Create NO draft' })).toBeNull()
  })
})

describe('locale chips', () => {
  const locales = (supportedLocales: string[]) => ({
    'GET /api/settings/locales': () =>
      json({ defaultLocale: 'en', supportedLocales, source: 'runtime' }),
  })

  it('follow the locales set in Setup › Locales, not the configuration', async () => {
    openEditor({ doc: aheadDoc() }, { routes: locales(['en', 'de']) })
    const bar = await header()
    expect(await within(bar).findByRole('button', { name: 'Create DE draft' })).toBeVisible()
    expect(within(bar).queryByRole('button', { name: 'Create NO draft' })).toBeNull()
  })

  it('are not shown when the site has one locale', async () => {
    openEditor({ doc: aheadDoc() }, { routes: locales(['en']) })
    const bar = await header()
    await screen.findByRole('textbox', { name: 'title' })
    expect(within(bar).queryByRole('group', { name: 'Locales' })).toBeNull()
  })
})
