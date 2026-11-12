import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findMain, headers, installApi, json, renderAt } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Site overview', () => {
  it('shows one section per collection plus Layout, with the §3 columns', async () => {
    installApi()
    renderAt('/site')
    const pages = await screen.findByRole('region', { name: 'Pages' })
    expect(screen.getByRole('region', { name: 'Services' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Layout' })).toBeInTheDocument()
    const table = within(pages).getByRole('table')
    expect(headers(table)).toEqual(['Page', 'Status', 'Findability', 'Locales', 'Updated'])
    expect(pages).toHaveTextContent('1 live')
    expect(pages).toHaveTextContent('1 draft ahead')
    expect(pages).toHaveTextContent('1 draft')
    expect(within(pages).getByRole('link', { name: 'Pages' })).toHaveAttribute(
      'href',
      '/site/pages',
    )
  })

  it('reads every collection from the one cross-collection list in the default locale', async () => {
    const calls = installApi()
    renderAt('/site')
    await screen.findByRole('region', { name: 'Pages' })
    const lists = calls.filter((call) => call.key === 'GET /api/content')
    expect(lists).toHaveLength(1)
    const params = new URLSearchParams(lists[0]?.search)
    expect(params.get('locale')).toBe('en')
    expect(params.get('view')).toBe('summary')
    expect(params.has('collections')).toBe(false)
    expect(calls.filter((call) => /^GET \/api\/content\/[a-z]+$/.test(call.key))).toEqual([])
  })

  it('reads each row: title, URL, status, findability, locales', async () => {
    installApi()
    renderAt('/site')
    const pages = await screen.findByRole('region', { name: 'Pages' })
    const about = within(pages).getByRole('link', { name: 'About' }).closest('tr') as HTMLElement
    expect(within(about).getByRole('link', { name: /\/about on the site/ })).toHaveAttribute(
      'href',
      'https://fjord.example/about',
    )
    expect(about).toHaveTextContent('Live')
    expect(about).toHaveTextContent('Own meta description')
    expect(about).toHaveTextContent('Structured data valid')
    const pricing = within(pages)
      .getByRole('link', { name: 'Pricing' })
      .closest('tr') as HTMLElement
    expect(pricing).toHaveTextContent('Unpublished changes')
    expect(pricing).toHaveTextContent('Falls back to description')
    expect(pricing).toHaveTextContent('Structured data has errors')
    expect(pricing).toHaveTextContent('no missing')
    const contact = within(pages)
      .getByRole('link', { name: 'Contact' })
      .closest('tr') as HTMLElement
    expect(contact).toHaveTextContent('Not published')
    expect(contact).toHaveTextContent('No meta description')
    expect(contact).toHaveTextContent('Structured data checked once live')
    expect(within(contact).queryByRole('link', { name: /on the site/ })).toBeNull()
  })

  it('lists the globals as shared, read by every page, opening the Layout editor', async () => {
    installApi()
    renderAt('/site')
    const layout = await screen.findByRole('region', { name: 'Layout' })
    const footer = within(layout).getByRole('link', { name: 'Footer' })
    expect(footer).toHaveAttribute('href', '/layout/footer')
    const row = footer.closest('tr') as HTMLElement
    expect(row).toHaveTextContent('no URL, shared')
    expect(row).toHaveTextContent('Read by every page')
  })

  it('without seo and with one locale: no graph lines, no Locales column, neither source read', async () => {
    // The configuration names two locales; Setup › Locales holds one, and that is what counts
    const calls = installApi({
      features: { localization: 'enabled' },
      routes: {
        'GET /api/settings/locales': () =>
          json({ defaultLocale: 'en', supportedLocales: ['en'], source: 'runtime' }),
      },
    })
    renderAt('/site')
    const pages = await screen.findByRole('region', { name: 'Pages' })
    expect(headers(within(pages).getByRole('table'))).toEqual([
      'Page',
      'Status',
      'Findability',
      'Updated',
    ])
    expect(pages).not.toHaveTextContent('Structured data')
    expect(pages).toHaveTextContent('Own meta description')
    const keys = calls.map((call) => call.key)
    expect(keys).not.toContain('GET /api/seo/findings')
    expect(keys).not.toContain('GET /api/translations/status')
  })

  it('says the findings are unavailable instead of guessing', async () => {
    installApi({ broken: ['/api/seo/findings'] })
    renderAt('/site')
    const pages = await screen.findByRole('region', { name: 'Pages' })
    expect(pages).toHaveTextContent('Structured data unavailable')
  })

  it('offers to try again when the collections cannot be read', async () => {
    installApi({ broken: ['/api/collections'] })
    renderAt('/site')
    const alert = await (await findMain()).findByRole('alert')
    expect(alert).toHaveTextContent('The site could not load')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
