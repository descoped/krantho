import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalesCell } from '../src/site/site-cells.js'
import type { SiteRow } from '../src/site/site-model.js'
import { DOCUMENTS, findMain, installApi, renderAt } from './fixtures/site-api.js'

// ---------------------------------------------------------------------------
// Focus never falls to the page's body when an action removes the control that started it
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openPages(path = '/site/pages'): Promise<HTMLElement> {
  renderAt(path)
  return screen.findByRole('region', { name: 'Pages documents' })
}

describe('Collection view focus', () => {
  it('Clear selection moves focus to the listing', async () => {
    installApi()
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select pricing' }))
    await user.click(within(listing).getByRole('button', { name: 'Clear selection' }))
    expect(within(listing).queryByRole('region', { name: 'Selection' })).toBeNull()
    await waitFor(() => expect(listing).toHaveFocus())
  })

  it('Show all moves focus to the listing once the table is back', async () => {
    // No document has unpublished changes, so that filter is empty
    installApi({ documents: DOCUMENTS.filter(({ meta }) => meta.slug !== 'pricing') })
    const listing = await openPages('/site/pages?status=ahead')
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('button', { name: 'Show all' }))
    expect(within(listing).getByRole('table')).toBeInTheDocument()
    await waitFor(() => expect(listing).toHaveFocus())
  })

  it('Try again moves focus to the listing when the collection loads', async () => {
    const broken = ['/api/collections']
    installApi({ broken })
    renderAt('/site/pages')
    const main = await findMain()
    const alert = await main.findByRole('alert')
    broken.length = 0
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }))
    const listing = await screen.findByRole('region', { name: 'Pages documents' })
    await waitFor(() => expect(listing).toHaveFocus())
  })

  it('Try again moves focus to the error panel when it fails again', async () => {
    installApi({ broken: ['/api/collections'] })
    renderAt('/site/pages')
    const main = await findMain()
    const first = await main.findByRole('alert')
    await userEvent.setup().click(within(first).getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(main.getByRole('alert', { name: 'The collection could not load' })).toHaveFocus(),
    )
  })

  it('focuses the error panel when the reload after a bulk action fails', async () => {
    const broken: string[] = []
    installApi({ broken })
    const listing = await openPages()
    const user = userEvent.setup()
    await user.click(within(listing).getByRole('checkbox', { name: 'Select pricing' }))
    await user.click(within(listing).getByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish documents' })
    broken.push('/api/collections')
    await user.click(within(dialog).getByRole('button', { name: 'Publish 1 document' }))
    const main = await findMain()
    const alert = await main.findByRole('alert', { name: 'The collection could not load' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(alert).toHaveFocus())
  })

  it('announces that the collection is loading', async () => {
    installApi({ pending: ['/api/content'] })
    renderAt('/site/pages')
    expect(await screen.findByText('Loading pages…')).toHaveAttribute('role', 'status')
  })
})

describe('Site overview focus', () => {
  it('Try again moves focus to the Site heading when the site loads', async () => {
    const broken = ['/api/collections']
    installApi({ broken })
    renderAt('/site')
    const main = await findMain()
    const alert = await main.findByRole('alert')
    broken.length = 0
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('region', { name: 'Pages' })
    await waitFor(() => expect(main.getByRole('heading', { level: 1, name: 'Site' })).toHaveFocus())
  })
})

describe('Locales cell', () => {
  it('gives screen readers words when locale versions are not tracked', () => {
    const row: SiteRow = {
      collection: 'pages',
      slug: 'about',
      locale: 'en',
      title: 'About',
      status: 'live',
      version: 1,
      liveVersion: 1,
      updatedAt: '2026-10-01T10:00:00.000Z',
      path: '/about',
      meta: 'covered',
      graph: 'off',
      locales: { state: 'off' },
    }
    render(<LocalesCell row={row} />)
    expect(screen.getByText('Locale versions not tracked')).toHaveClass('visually-hidden')
  })
})
