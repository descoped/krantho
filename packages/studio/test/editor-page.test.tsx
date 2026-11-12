import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aheadDoc,
  contentOf,
  header,
  memoryStorage,
  openEditor,
  storeRoutes,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { installApi, json, renderAt } from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('editor header', () => {
  it('shows the modes that exist, one status chip, locales, Open on site, Save draft and Publish — no status select', async () => {
    openEditor({ doc: aheadDoc() }, { mode: null })
    const bar = await header()
    expect(within(bar).getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true')
    expect(
      within(bar)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Live', 'Structure', 'Data'])
    const chip = within(bar).getByRole('button', { name: 'Unpublished changes' })
    await userEvent.setup().click(chip)
    expect(bar).toHaveTextContent('Draft v3 · live is v2')
    expect(within(bar).getByRole('link', { name: /Open on site/ })).toHaveAttribute(
      'href',
      'https://fjord.example/pricing',
    )
    expect(within(bar).getByRole('link', { name: 'EN version' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(await within(bar).findByRole('button', { name: 'Create NO draft' })).toBeVisible()
    expect(within(bar).getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(bar).getByRole('button', { name: 'Publish' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    // No status select anywhere
    expect(screen.queryByRole('option', { name: /^Published$/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /status/i })).toBeNull()
  })

  it('reads Live when the live version is the current one, and has nothing to publish', async () => {
    openEditor({ doc: { ...aheadDoc(), liveVersion: 3 } })
    const bar = await header()
    expect(within(bar).getByRole('button', { name: 'Live' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Publish' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('reads Not published, with no page to open, when nothing is live', async () => {
    openEditor({ doc: { ...aheadDoc(), liveVersion: null } })
    const bar = await header()
    expect(within(bar).getByRole('button', { name: 'Not published' })).toBeInTheDocument()
    expect(within(bar).queryByRole('link', { name: /Open on site/ })).toBeNull()
  })

  it('is read-only while someone else holds the lock, and the lock chip names them', async () => {
    openEditor({ doc: aheadDoc(), lockedBy: 'editor:other@e2e.local' })
    const bar = await header()
    expect(
      await within(bar).findByRole('button', { name: 'other@e2e.local is editing' }),
    ).toBeInTheDocument()
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled()
    expect(within(bar).getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('Save draft and Publish', () => {
  it('saves a new version and says the live page is unchanged', async () => {
    const calls = openEditor({ doc: aheadDoc() })
    const bar = await header()
    const user = userEvent.setup()
    const title = await screen.findByRole('textbox', { name: 'title' })
    await user.type(title, ' plans')
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    expect(
      await screen.findByText('Draft saved · v4. The live page is unchanged until you publish.'),
    ).toBeInTheDocument()
    const put = calls.find((call) => call.key === 'PUT /api/content/pages/pricing')
    expect(put?.body).toMatchObject({
      fields: { title: 'Pricing plans' },
      _version: 3,
      locale: 'en',
    })
    expect(within(bar).getByRole('button', { name: 'Unpublished changes' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Save draft' })).toHaveFocus()
  })

  it('confirms "Publish <slug> v<n>?" with what it refreshes, then reads Live', async () => {
    const calls = openEditor({ doc: aheadDoc(), cachedEntries: 3 })
    const bar = await header()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(dialog).toHaveTextContent('Visitors see v2 now and will see v3.')
    expect(await within(dialog).findByText('/pricing')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('the lists of pages')
    expect(dialog).toHaveTextContent('3 cached entries carrying it')
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
    // The API records the publication as a new version: the toast names both
    expect(
      await screen.findByText('Published pricing · v3 is live, recorded as v4.'),
    ).toBeInTheDocument()
    const publish = calls.find((call) => call.key === 'POST /api/content/pages/pricing/publish')
    expect(publish?.body).toEqual({ status: 'published' })
    expect(within(bar).getByRole('button', { name: 'Live' })).toBeInTheDocument()
  })

  it('unpublishes from the status chip, after a confirmation, with focus back on the chip', async () => {
    const calls = openEditor({ doc: aheadDoc() })
    const bar = await header()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Unpublished changes' }))
    await user.click(within(bar).getByRole('button', { name: 'Unpublish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Unpublish pricing?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const call = calls.find((c) => c.key === 'POST /api/content/pages/pricing/publish')
    expect(call?.body).toEqual({ status: 'draft' })
    expect(
      within(bar).getByRole('button', { name: /^(Live|Unpublished changes|Not published)$/ }),
    ).toHaveFocus()
  })

  it("lists the saved version's SEO errors and warnings, worst first, and still publishes", async () => {
    openEditor(
      { doc: aheadDoc() },
      {
        routes: {
          'GET /api/seo/findings/pages/pricing': () =>
            json({
              findings: [
                {
                  severity: 'warning',
                  check: 'meta-description',
                  message: 'Meta description is short',
                },
                { severity: 'info', check: 'title', message: 'Title is fine' },
                {
                  severity: 'error',
                  check: 'structured-data',
                  message: 'Missing the required property',
                  reader: 'google',
                  type: 'Article',
                  property: 'headline',
                },
              ],
              readers: [{ id: 'google', name: 'Google' }],
            }),
        },
      },
    )
    const bar = await header()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(await within(dialog).findByText(/SEO findings in v3: 1 error · 1 warning/)).toBeVisible()
    expect(dialog).toHaveTextContent('They do not stop publishing.')
    const items = within(dialog).getAllByRole('listitem').slice(-2)
    expect(items[0]).toHaveTextContent('Google: Missing the required property Article.headline')
    expect(items[1]).toHaveTextContent('Meta description is short')
    expect(dialog).not.toHaveTextContent('Title is fine')
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
    expect(
      await screen.findByText('Published pricing · v3 is live, recorded as v4.'),
    ).toBeInTheDocument()
  })

  it('says so when the saved version has no SEO errors or warnings', async () => {
    openEditor(
      { doc: aheadDoc() },
      {
        routes: {
          'GET /api/seo/findings/pages/pricing': () => json({ findings: [], readers: [] }),
        },
      },
    )
    const bar = await header()
    await userEvent.setup().click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(await within(dialog).findByText('No SEO errors or warnings in v3.')).toBeVisible()
  })

  it('still publishes when the findings cannot be read', async () => {
    openEditor({ doc: aheadDoc() }, { broken: ['/api/seo/findings/pages/pricing'] })
    const bar = await header()
    await userEvent.setup().click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(
      await within(dialog).findByText(
        "The page's SEO findings could not be read. Publishing still works.",
      ),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Publish' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows no findings, and asks for none, when SEO is off', async () => {
    const calls = openEditor({ doc: aheadDoc() }, { features: {} })
    const bar = await header()
    await userEvent.setup().click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(await within(dialog).findByText('/pricing')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('SEO')
    expect(calls.some((call) => call.key.startsWith('GET /api/seo/findings'))).toBe(false)
  })

  it('shows no cached-entry count when krantho does not know it', async () => {
    openEditor({ doc: aheadDoc(), cachedEntries: null })
    const bar = await header()
    await userEvent.setup().click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish pricing v3?' })
    expect(await within(dialog).findByText('/pricing')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('cached')
  })
})

describe('Structure mode', () => {
  it('shows each field with its label, required or optional, type, SEO use, input and help', async () => {
    openEditor({ doc: aheadDoc() })
    await header()
    const title = (await screen.findByRole('textbox', { name: 'title' })).closest(
      '.editor-field',
    ) as HTMLElement
    expect(title).toHaveTextContent('*')
    expect(title).toHaveTextContent('type text')
    expect(title).toHaveTextContent('used for search as title')
    expect(within(title).getByRole('textbox')).toHaveAccessibleDescription('The page heading')

    const meta = screen.getByRole('textbox', { name: 'meta-description' }).closest('.editor-field')
    expect(meta).toHaveTextContent('optional')
    expect(meta).toHaveTextContent('used for search as meta description')
    const description = screen
      .getByRole('textbox', { name: 'description' })
      .closest('.editor-field')
    expect(description).toHaveTextContent('backup for meta description')

    const hero = screen.getByRole('group', { name: 'hero' })
    expect(hero.closest('.editor-field')).toHaveTextContent('type image or file')
    expect(within(hero).getByRole('button', { name: 'Choose image' })).toBeInTheDocument()

    // The API owns status: it is never a field of the form
    expect(screen.queryByRole('combobox', { name: 'status' })).toBeNull()
    const body = screen.getByRole('region', { name: 'Body' })
    expect(body).toHaveTextContent('markdown · ## headings become sections')
    expect(within(body).getByRole('textbox', { name: 'Body' })).toHaveValue('## Intro\n\nHello.')
  })

  it('shows the body beside its rendering with Split, and rendered alone with Preview', async () => {
    openEditor({ doc: aheadDoc() })
    const body = await screen.findByRole('region', { name: 'Body' })
    const user = userEvent.setup()
    const split = within(body).getByRole('button', { name: 'Split' })
    await user.click(split)
    expect(split).toHaveAttribute('aria-pressed', 'true')
    expect(within(body).getByRole('textbox', { name: 'Body' })).toBeVisible()
    expect(await within(body).findByRole('heading', { name: 'Intro' })).toBeVisible()
    await user.click(within(body).getByRole('button', { name: 'Preview' }))
    expect(within(body).queryByRole('textbox', { name: 'Body' })).toBeNull()
    expect(split).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(body).getByRole('button', { name: 'Preview' }))
    expect(within(body).getByRole('textbox', { name: 'Body' })).toBeVisible()
  })
})

describe('Media fields and globals', () => {
  it('shows the chosen image: name, dimensions, size and alt status, with Change and Clear', async () => {
    const doc = { ...aheadDoc(), fields: { title: 'Pricing', hero: 'm1' } }
    installApi({
      routes: {
        ...storeRoutes({ doc }),
        'GET /api/media/m1': () =>
          json({
            id: 'm1',
            filename: 'fjord.jpg',
            url: '/uploads/fjord.jpg',
            altText: '',
            mimeType: 'image/jpeg',
            size: 2048,
            width: 1200,
            height: 630,
            folder: null,
            tags: [],
            crop: null,
            hotspot: null,
            createdAt: '2026-10-01T10:00:00.000Z',
          }),
      },
    })
    renderAt('/site/pages/pricing?mode=structure')
    const hero = await screen.findByRole('group', { name: 'hero' })
    expect(await within(hero).findByText('fjord.jpg')).toBeInTheDocument()
    expect(hero).toHaveTextContent('1200 × 630 · 2.0 KB')
    expect(hero).toHaveTextContent('No alt text')
    expect(within(hero).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    await userEvent.setup().click(within(hero).getByRole('button', { name: 'Clear' }))
    expect(within(hero).getByRole('button', { name: 'Choose image' })).toHaveFocus()
  })

  it('edits a global in Fields mode, with no body and no page to open', async () => {
    const footer = { title: { type: 'string' }, 'footer-title': { type: 'string' } }
    installApi({
      routes: {
        'GET /api/schema/globals': () =>
          json({
            contract: {
              id: 'test/content',
              revision: 'test',
              label: 'Content',
              fields: { properties: footer },
              metadata: {},
              body: 'optional',
              sections: [],
            },
            name: 'globals',
            source: 'database',
            schema: { properties: footer },
          }),
        'GET /api/content/globals/footer': () =>
          json(
            contentOf(
              { slug: 'footer', version: 1, liveVersion: 1, fields: { title: 'Footer' } },
              'globals',
            ),
          ),
        'POST /api/content/globals/footer/lock': () => json({ locked: true }),
        'DELETE /api/content/globals/footer/lock': () => json({ locked: false }),
      },
    })
    renderAt('/layout/footer')
    const bar = await header()
    expect(within(bar).getByRole('tab', { name: 'Fields' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(bar).queryByRole('link', { name: /Open on site/ })).toBeNull()
    // A global shows the fields its document holds; it has no body
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Footer')
    expect(screen.queryByRole('textbox', { name: 'footer-title' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Body' })).toBeNull()
  })
})
