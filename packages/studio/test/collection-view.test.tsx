import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOCUMENTS,
  findMain,
  headers,
  installApi,
  json,
  main,
  renderAt,
} from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Collection view', () => {
  async function openPages(): Promise<HTMLElement> {
    renderAt('/site/pages')
    return screen.findByRole('region', { name: 'Pages documents' })
  }

  function slugs(listing: HTMLElement): string[] {
    return within(listing)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('link')[0]?.textContent ?? '')
  }

  it('shows the §3 columns, the live version and the shown-count', async () => {
    installApi()
    const listing = await openPages()
    expect(headers(within(listing).getByRole('table'))).toEqual([
      '',
      'Slug',
      'Status',
      'Live',
      'SEO',
      'Locales',
      'Updated',
    ])
    expect(listing).toHaveTextContent('3 of 3 shown')
    const pricing = within(listing)
      .getByRole('link', { name: 'pricing' })
      .closest('tr') as HTMLElement
    expect(pricing).toHaveTextContent('v2')
    expect(within(listing).getByRole('link', { name: 'contact' }).closest('tr')).toHaveTextContent(
      'Not published',
    )
  })

  it('offers the locales set in Setup › Locales, and drops the Locales column for one', async () => {
    const locales = (supportedLocales: string[]) => ({
      routes: {
        'GET /api/settings/locales': () =>
          json({ defaultLocale: 'en', supportedLocales, source: 'runtime' }),
      },
    })
    installApi(locales(['en', 'de']))
    const listing = await openPages()
    const picker = within(listing).getByLabelText('Locale')
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['en', 'de'])
    cleanup()
    installApi(locales(['en']))
    const single = await openPages()
    expect(within(single).queryByLabelText('Locale')).toBeNull()
    expect(headers(within(single).getByRole('table'))).not.toContain('Locales')
  })

  it('reads the collection from the cross-collection list, named in collections', async () => {
    const calls = installApi()
    await openPages()
    const lists = calls.filter((call) => call.key === 'GET /api/content')
    expect(lists).toHaveLength(1)
    const params = new URLSearchParams(lists[0]?.search)
    expect(params.get('collections')).toBe('pages')
    expect(params.get('locale')).toBe('en')
    expect(params.get('view')).toBe('summary')
    expect(calls.filter((call) => /^GET \/api\/content\/[a-z]+$/.test(call.key))).toEqual([])
  })

  it('filters by status and sorts by updated or slug', async () => {
    installApi()
    const listing = await openPages()
    expect(slugs(listing)).toEqual(['pricing', 'about', 'contact'])
    const user = userEvent.setup()
    await user.selectOptions(within(listing).getByLabelText('Sort'), 'slug')
    expect(slugs(listing)).toEqual(['about', 'contact', 'pricing'])
    await user.click(within(listing).getByRole('button', { name: /^Unpublished changes/ }))
    expect(slugs(listing)).toEqual(['pricing'])
    expect(listing).toHaveTextContent('1 of 3 shown')
    await user.click(within(listing).getByRole('button', { name: /^Not published/ }))
    expect(slugs(listing)).toEqual(['contact'])
  })

  it('publishes the selection after a confirmation naming the count', async () => {
    const calls = installApi()
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select pricing' }))
    const bar = within(listing).getByRole('region', { name: 'Selection' })
    expect(bar).toHaveTextContent('1 selected')
    await user.click(within(bar).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish documents' })
    expect(dialog).toHaveTextContent('Publish 1 document in en?')
    expect(calls.some((call) => call.key === 'POST /api/content/pages/bulk-publish')).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Publish 1 document' }))
    expect(await within(dialog).findByText('Published 1 document.')).toBeInTheDocument()
    const publish = calls.find((call) => call.key === 'POST /api/content/pages/bulk-publish')
    expect(publish?.body).toEqual({ slugs: ['pricing'], locale: 'en' })

    // The selection bar that opened the dialog is gone; focus lands on the listing, not the body
    expect(within(listing).queryByRole('region', { name: 'Selection' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(listing).toHaveFocus())
  })

  it('returns focus to the listing when the bulk action fails', async () => {
    installApi({ broken: ['/api/content/pages/bulk-publish'] })
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select pricing' }))
    await user.click(within(listing).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish documents' })
    await user.click(within(dialog).getByRole('button', { name: 'Publish 1 document' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(listing).toHaveFocus())
  })

  it('deletes the selection only after the confirmation', async () => {
    const calls = installApi()
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select contact' }))
    await user.click(within(listing).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete documents' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls.some((call) => call.key === 'DELETE /api/content/pages/bulk')).toBe(false)
    // Nothing ran: focus goes back to the button that opened the dialog
    expect(within(listing).getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.click(within(listing).getByRole('button', { name: 'Delete' }))
    const again = await screen.findByRole('dialog', { name: 'Delete documents' })
    await user.click(within(again).getByRole('button', { name: 'Delete 1 document' }))
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'DELETE /api/content/pages/bulk')?.body).toEqual({
        slugs: ['contact'],
        locale: 'en',
      }),
    )
  })

  it('deletes in the chosen locale, offered there too', async () => {
    const norwegian = {
      meta: { collection: 'pages', slug: 'contact', locale: 'no', version: 1, liveVersion: null },
      fields: { title: 'Kontakt' },
      createdAt: '2026-09-30T10:00:00.000Z',
    }
    const calls = installApi({ documents: [...DOCUMENTS, norwegian] })
    renderAt('/site/pages?locale=no')
    const listing = await screen.findByRole('region', { name: 'Pages documents' })
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select contact' }))
    await user.click(within(listing).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete documents' })
    expect(dialog).toHaveTextContent('Delete 1 document in no?')
    await user.click(within(dialog).getByRole('button', { name: 'Delete 1 document' }))
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'DELETE /api/content/pages/bulk')?.body).toEqual({
        slugs: ['contact'],
        locale: 'no',
      }),
    )
  })

  it('selects every shown row with Select all', async () => {
    installApi()
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select all shown' }))
    expect(within(listing).getByRole('region', { name: 'Selection' })).toHaveTextContent(
      '3 selected',
    )
  })

  it('imports pasted JSON through the import API and shows the result', async () => {
    const calls = installApi()
    await openPages()
    const user = userEvent.setup()
    await user.click(main().getByRole('button', { name: 'Import' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import documents' })
    await user.click(within(dialog).getByLabelText('JSON'))
    await user.paste(
      '{"items":[{"identity":{"collection":"pages","slug":"new","locale":"en"},"contract":null,"metadata":{},"defaults":[],"fields":{"title":"New"},"body":""}]}',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Import' }))
    expect(await within(dialog).findByText(/Imported 1 of 1/)).toBeInTheDocument()
    expect(calls.find((c) => c.key === 'POST /api/content/pages/import')?.body).toEqual({
      items: [
        {
          metadata: {},
          identity: { collection: 'pages', slug: 'new', locale: 'en' },
          contract: null,
          defaults: [],
          fields: { title: 'New' },
          body: '',
        },
      ],
    })
  })

  it('offers New, Import and selection to editors only', async () => {
    installApi({ role: 'viewer' })
    const listing = await openPages()
    expect(within(listing).queryByRole('checkbox')).toBeNull()
    expect(main().queryByRole('button', { name: 'Import' })).toBeNull()
    expect(main().queryByRole('link', { name: /^New/ })).toBeNull()
    expect(main().getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('links New to the new-document route', async () => {
    installApi()
    await openPages()
    expect(main().getByRole('link', { name: 'New page' })).toHaveAttribute('href', '/new/pages')
  })

  it.each(['/site/nope', '/site/globals'])('renders Not found at %s', async (path) => {
    installApi()
    renderAt(path)
    expect(await (await findMain()).findByRole('heading', { name: 'Nothing here' })).toBeVisible()
  })

  it.each(['/site/nope', '/site/globals'])(
    'names nothing in the breadcrumbs at %s',
    async (path) => {
      installApi()
      renderAt(path)
      await (await findMain()).findByRole('heading', { name: 'Nothing here' })
      const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
      await waitFor(() => expect(trail).toHaveTextContent(/^Not found$/))
    },
  )
})
