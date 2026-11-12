import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  memoryStorage,
  openEditor,
  storeRoutes,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { card, mediaItem, panel, pricing, seoRoutes } from './fixtures/side-panel.js'
import { installApi, json, renderAt } from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('side panel, read-only and media', () => {
  it('disables its edit controls while someone else holds the lock, like the form', async () => {
    openEditor({ doc: pricing(), lockedBy: 'editor:other@e2e.local' }, { routes: seoRoutes() })
    const sections = await card('Page & sections')
    await waitFor(() =>
      expect(within(sections).getByRole('button', { name: 'Approach Add section' })).toBeDisabled(),
    )
    // The advice is shown, but Edit is not offered to a form that cannot be edited
    const search = await card('Search and sharing')
    expect(search).toHaveTextContent('Search results show the description.')
    expect(within(search).queryByRole('button', { name: /^Edit/ })).toBeNull()
    const user = userEvent.setup()
    await user.click(within(sections).getByRole('button', { name: /^Notes\s*prose$/ }))
    expect(
      within(await panel()).getByRole('textbox', { name: 'meta-description-Notes' }),
    ).toBeDisabled()
  })

  it('gives a read-only viewer a keyboard path to each field: a list in the panel', async () => {
    openEditor({ doc: pricing(), lockedBy: 'editor:other@e2e.local' }, { routes: seoRoutes() })
    const fields = await card('Fields')
    const title = within(fields).getByRole('button', { name: /^title\s*text$/ })
    title.focus()
    await userEvent.setup().keyboard('{Enter}')
    const heading = within(await panel()).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Field · title')
    expect(heading).toHaveFocus()
  })

  it('shows no field list while the form can be edited', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await card('Page & sections')
    expect(within(await panel()).queryByRole('region', { name: 'Fields' })).toBeNull()
  })

  it('offers Crop & hotspot, Replace and the alt text for a media field, saved on the media file', async () => {
    const calls = openEditor(
      { doc: pricing({ hero: 'm1' }) },
      {
        features: { seo: 'enabled', localization: 'enabled', media: 'enabled' },
        routes: seoRoutes({
          'GET /api/media/m1': () => json(mediaItem('')),
          'PUT /api/media/m1': (sent) => json(mediaItem((sent as { altText: string }).altText)),
        }),
      },
    )
    await panel()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Change' }))
    await user.keyboard('{Escape}')
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · hero')
    expect(await within(side).findByRole('link', { name: 'Crop & hotspot' })).toHaveAttribute(
      'href',
      '/media/m1/edit',
    )
    expect(within(side).getByRole('button', { name: 'Replace' })).toBeEnabled()
    expect(side).toHaveTextContent(
      'Replacing keeps the id, so pages update without a content change.',
    )
    await user.type(within(side).getByRole('textbox', { name: 'Alt text' }), 'A fjord at dawn')
    const save = within(side).getByRole('button', { name: 'Save alt text' })
    await user.click(save)
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PUT /api/media/m1')?.body).toEqual({
        altText: 'A fjord at dawn',
      }),
    )
    // The panel takes the saved file: nothing left to save, and focus stays on Save
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'))
    expect(save).toHaveFocus()
    expect(within(side).getByRole('textbox', { name: 'Alt text' })).toHaveValue('A fjord at dawn')
  })

  it('disables Crop & hotspot, Replace and the alt text while someone else holds the lock', async () => {
    openEditor(
      { doc: pricing({ hero: 'm1' }), lockedBy: 'editor:other@e2e.local' },
      {
        features: { seo: 'enabled', localization: 'enabled', media: 'enabled' },
        routes: seoRoutes({ 'GET /api/media/m1': () => json(mediaItem('Fjord')) }),
      },
    )
    const fields = await card('Fields')
    await userEvent.setup().click(within(fields).getByRole('button', { name: /^hero/ }))
    const side = await panel()
    expect(await within(side).findByRole('button', { name: 'Crop & hotspot' })).toBeDisabled()
    expect(within(side).queryByRole('link', { name: 'Crop & hotspot' })).toBeNull()
    expect(within(side).getByRole('button', { name: 'Replace' })).toBeDisabled()
    expect(within(side).getByRole('textbox', { name: 'Alt text' })).toBeDisabled()
  })

  it('finds the social image through the fallback chain: hero-image, then the site default', async () => {
    const siteDefault = (): Response =>
      json({
        config: {
          id: 'site',
          scope: 'site',
          config: {
            entities: [{ '@type': 'Organization', properties: { 'og-default-image': '/og.png' } }],
          },
        },
      })
    openEditor(
      { doc: pricing() },
      { routes: seoRoutes({ 'GET /api/seo/config/site': siteDefault }) },
    )
    const search = await card('Search and sharing')
    await waitFor(() => expect(search).toHaveTextContent('Social imageSet /og.png'))
  })

  it('reads the social image from hero-image when og-image and image are not set', async () => {
    openEditor({ doc: pricing({ 'hero-image': 'm7' }) }, { routes: seoRoutes() })
    const search = await card('Search and sharing')
    expect(search).toHaveTextContent('Social imageSet m7')
  })
})

describe('side panel, before a page exists', () => {
  it('measures the form for a new page and says what follows once it is saved', async () => {
    installApi({ routes: { ...storeRoutes({ doc: pricing() }), ...seoRoutes() } })
    renderAt('/new/pages')
    const side = await panel()
    const sections = await within(side).findByRole('region', { name: 'Page & sections' })
    expect(sections).toHaveTextContent('0 / 3 designed')
    const search = within(side).getByRole('region', { name: 'Search and sharing' })
    expect(search).toHaveTextContent('Meta description')
    expect(within(side).getByRole('region', { name: 'Reach' })).toHaveTextContent(
      'Save the page first',
    )
  })

  it('shows no search checks for a collection without pages', async () => {
    const routes = seoRoutes({
      'GET /api/collections': () =>
        json({ collections: [{ name: 'pages', source: 'database', pages: false, sections: [] }] }),
    })
    const calls = openEditor({ doc: pricing() }, { routes })
    await card('Page & sections')
    expect(within(await panel()).queryByRole('region', { name: 'Search and sharing' })).toBeNull()
    expect(calls.some((call) => call.key.startsWith('GET /api/seo/'))).toBe(false)
    // Publishing refreshes no page of a collection without pages
    expect(await card('Reach')).not.toHaveTextContent('Publishing refreshes')
  })
})
