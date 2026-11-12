import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSetupApi } from './fixtures/setup-api.js'
import { json, renderAt } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** What the create path posted */
const created: unknown[] = []

/** The editor's create path: the missing locale answers 404, the default locale's version is copied */
const CREATE_ROUTES = {
  'GET /api/content/pages/pricing': (_body: unknown, url: URL) =>
    url.searchParams.get('locale') === 'no'
      ? json({ error: 'Content not found' }, 404)
      : json({
          metadata: {},
          contract: null,
          defaults: [],
          repositoryBasis: null,

          meta: { collection: 'pages', slug: 'pricing', locale: 'en', version: 3, liveVersion: 2 },
          fields: { title: 'Pricing' },
          body: 'What it costs.',
        }),
  'POST /api/content/pages': (body: unknown) => {
    created.push(body)
    return json({ slug: 'pricing', collection: 'pages', version: 1, liveVersion: null }, 201)
  },
}

async function localeTable(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'Locales' })
}

describe('Setup › Locales', () => {
  it('lists the locales with the default, and says the configuration sets the default', async () => {
    installSetupApi()
    renderAt('/setup/locales')
    const table = await localeTable()
    const en = within(table).getByRole('rowheader', { name: 'en' }).closest('tr') as HTMLElement
    expect(en).toHaveTextContent('Default')
    expect(within(en).queryByRole('button')).toBeNull()
    const region = screen.getByRole('region', { name: 'Locales' })
    expect(region).toHaveTextContent('site.supportedLocales')
    expect(region).toHaveTextContent('default locale is site.defaultLocale')
    expect(region).toHaveTextContent('Configuration')
    expect(within(table).queryByRole('button', { name: /as default/ })).toBeNull()
  })

  it('offers only configured locales that are not active, and says when there are none', async () => {
    installSetupApi()
    renderAt('/setup/locales')
    await localeTable()
    expect(screen.queryByLabelText('Locale code')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Every locale in the configuration is active.')).toBeInTheDocument()
  })

  it('switches on a configured locale through /api/settings/locales, then says the database holds the choice', async () => {
    const state = installSetupApi()
    state.locales = {
      defaultLocale: 'en',
      configuredLocales: ['en', 'no', 'sv'],
      supportedLocales: ['en', 'no'],
      source: 'config',
    }
    renderAt('/setup/locales')
    await localeTable()
    const choice = screen.getByRole('combobox', { name: 'Configured locale' })
    expect(
      within(choice)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['sv'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add locale' }))
    await waitFor(() =>
      expect(state.sent.at(-1)?.body).toEqual({ supportedLocales: ['en', 'no', 'sv'] }),
    )
    expect(
      await within(await localeTable()).findByRole('rowheader', { name: 'sv' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Locales' })).toHaveTextContent('Database')
  })

  it('removes a locale but never sets the default', async () => {
    const state = installSetupApi()
    renderAt('/setup/locales')
    const user = userEvent.setup()
    await user.click(within(await localeTable()).getByRole('button', { name: 'Remove no' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove the locale no?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove locale' }))
    await waitFor(() => expect(state.locales.supportedLocales).toEqual(['en']))
    expect(state.locales.defaultLocale).toBe('en')
    expect(state.sent.at(-1)?.body).toEqual({ supportedLocales: ['en'] })
  })

  it('confirms Remove first, saying the documents in the locale are kept', async () => {
    const state = installSetupApi()
    renderAt('/setup/locales')
    const user = userEvent.setup()
    await user.click(within(await localeTable()).getByRole('button', { name: 'Remove no' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove the locale no?' })
    expect(dialog).toHaveTextContent('stops serving no')
    expect(dialog).toHaveTextContent('kept, not deleted')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(state.sent).toEqual([])
    expect(state.locales.supportedLocales).toEqual(['en', 'no'])
  })

  it('shows translation coverage, and Create draft makes the missing version from the default', async () => {
    installSetupApi({ routes: CREATE_ROUTES })
    renderAt('/setup/locales')
    const coverage = await screen.findByRole('region', { name: 'Translation coverage' })
    const table = await within(coverage).findByRole('table', { name: 'Pages: versions per locale' })
    const about = within(table)
      .getByRole('rowheader', { name: 'about' })
      .closest('tr') as HTMLElement
    expect(within(about).getAllByText('Exists')).toHaveLength(2)
    await userEvent
      .setup()
      .click(within(table).getByRole('button', { name: 'Create the no draft of pricing' }))
    expect(await within(table).findByRole('link', { name: 'Open the no draft' })).toHaveAttribute(
      'href',
      '/site/pages/pricing?locale=no',
    )
    expect(created).toEqual([
      {
        metadata: {},
        slug: 'pricing',
        fields: { title: 'Pricing' },
        body: 'What it costs.',
        locale: 'no',
      },
    ])
  })

  it('leaves coverage out for a single locale', async () => {
    const state = installSetupApi()
    state.locales = {
      defaultLocale: 'en',
      configuredLocales: ['en'],
      supportedLocales: ['en'],
      source: 'database',
    }
    renderAt('/setup/locales')
    await localeTable()
    expect(screen.queryByRole('region', { name: 'Translation coverage' })).toBeNull()
  })

  it('is read-only below admin, as the API refuses the writes', async () => {
    installSetupApi({ role: 'viewer', authMode: 'token' })
    renderAt('/setup/locales')
    await localeTable()
    expect(screen.getByText('Only admins change the locales.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    const coverage = await screen.findByRole('region', { name: 'Translation coverage' })
    await within(coverage).findByRole('table')
    expect(within(coverage).queryByRole('button')).toBeNull()
    expect(within(coverage).getByText('Missing')).toBeInTheDocument()
  })
})
