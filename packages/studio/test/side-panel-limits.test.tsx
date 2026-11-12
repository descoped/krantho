import { screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, openEditor, WARM_TIMEOUT_MS, warmEditor } from './fixtures/editor-api.js'
import { json } from './fixtures/site-api.js'

// The site's configuration is read once per session, so a site with limits of
// its own runs in a file of its own

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SITE = {
  site: {
    name: 'Fjord Studio',
    domain: 'fjord.example',
    baseUrl: 'https://fjord.example',
    defaultLocale: 'en',
    supportedLocales: ['en'],
  },
  seo: {
    limits: { metaDescription: { minChars: 50, maxChars: 70 }, title: { maxChars: 20 } },
    readers: ['google'],
  },
  cache: { pages: 'none', shared: 'none' },
}

describe('side panel, limits from the site configuration', () => {
  it('measures the meta description and the title against the limits the site configures', async () => {
    openEditor(
      {
        doc: {
          slug: 'pricing',
          version: 1,
          liveVersion: 1,
          fields: { title: 'Pricing and plans for teams', description: 'd'.repeat(60) },
        },
      },
      {
        features: { seo: 'enabled', localization: 'enabled' },
        routes: { 'GET /api/site-config': () => json(SITE) },
      },
    )
    const side = await screen.findByRole('complementary', { name: 'Side panel' })
    const search = await within(side).findByRole('region', { name: 'Search and sharing' })
    const meta = within(search).getByText('Meta description').closest('.side-length')
    expect(meta).toHaveAttribute('data-length-state', 'within')
    expect(meta).toHaveTextContent('60 chars · target 50–70')
    const title = within(search).getByText('Title').closest('.side-length')
    expect(title).toHaveAttribute('data-length-state', 'over')
    expect(title).toHaveTextContent('27 chars · limit 20')
    expect(title).toHaveTextContent('over the limit')
  })
})
