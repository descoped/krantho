import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  header,
  lockRoute,
  openEditor,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { byId, liveModeHooks, loadPage, TITLE } from './fixtures/live-mode.js'
import { card, panel, pricing, seoRoutes } from './fixtures/side-panel.js'
import { held, json } from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)
liveModeHooks()

describe('Live mode in the editor', () => {
  const features = { seo: 'enabled', localization: 'enabled', sitePreview: 'draft-mode' }

  it('opens by default for a page, with the page and the header instead of Page & sections and Reach', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes(), features, mode: null })
    await screen.findByTitle(TITLE)
    loadPage()
    const side = await panel()
    expect(await within(side).findByRole('region', { name: 'Metadata' })).toBeVisible()
    expect(within(side).queryByRole('region', { name: 'Page & sections' })).toBeNull()
    expect(within(side).queryByRole('region', { name: 'Reach' })).toBeNull()
    expect(within(side).queryByRole('list', { name: 'Fields not marked on the page' })).toBeNull()
  })

  it('selects a clicked element in the side panel, saying whether it can be edited in place', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes(), features, mode: 'live' })
    await screen.findByTitle(TITLE)
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · title')
    expect(side).toHaveTextContent('On the pageFound by Live mode: editable in place')
    expect(screen.getByRole('textbox', { name: 'Edit field title' })).toHaveFocus()
    // Back to nothing selected clears the outline
    await userEvent.setup().click(within(side).getByRole('button', { name: 'Page overview' }))
    expect(document.querySelector('.live-outline--selected')).toBeNull()
  })

  it('says a marked field is read-only while the form is', async () => {
    const doc = pricing()
    const lock = held(lockRoute({ doc, lockedBy: 'other@example.test' }))
    openEditor(
      { doc, lockedBy: 'other@example.test' },
      {
        routes: { ...seoRoutes(), [`POST /api/content/pages/${doc.slug}/lock`]: lock.route },
        features,
        mode: 'live',
      },
    )
    await screen.findByTitle(TITLE)
    const page = loadPage()
    fireEvent.click(byId(page, 'title-link'))
    const side = await panel()
    // Who holds the lock is not known yet, so the field is not called read-only
    await lock.requested
    expect(side).not.toHaveTextContent('read-only')
    lock.release()
    await waitFor(() => expect(side).toHaveTextContent('On the pageFound by Live mode; read-only'))
  })

  it('gives a document of a collection without pages no Live mode, even when the address asks', async () => {
    const collections = (): Response =>
      json({
        collections: [
          { name: 'pages', source: 'database', pages: false, path: false, sections: [] },
        ],
      })
    openEditor(
      { doc: pricing() },
      { routes: { 'GET /api/collections': collections }, features, mode: 'live' },
    )
    const bar = await header()
    expect(
      within(bar)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Structure', 'Data'])
    expect(within(bar).getByRole('tab', { name: 'Structure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByTitle(TITLE)).toBeNull()
    expect(within(bar).queryByRole('link', { name: /Open on site/ })).toBeNull()
  })

  it('says in the panel when a selected copy of a repeated heading cannot be told apart', async () => {
    const doc = { ...pricing(), body: 'Lead.\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.' }
    openEditor({ doc }, { routes: seoRoutes(), features, mode: 'live' })
    await screen.findByTitle(TITLE)
    const page = loadPage(`
      <aside data-krantho-document="pages/pricing" data-krantho-section="Notes"><p id="side-p">First.</p></aside>
      <article>
        <div data-krantho-document="pages/pricing" data-krantho-section="Notes" style="display:contents"><h2>Notes</h2><p>First.</p></div>
        <div data-krantho-document="pages/pricing" data-krantho-section="Notes" style="display:contents"><h2>Notes</h2><p>Second.</p></div>
      </article>`)
    fireEvent.click(byId(page, 'side-p'))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Section · Notes')
    expect(side).toHaveTextContent(
      'On the pageThis heading appears more than once in the body: edit it in Structure mode.',
    )
    expect(screen.queryByRole('textbox', { name: 'Edit section Notes' })).toBeNull()
  })

  it('shows no unmarked notes outside Live mode', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes(), features })
    const sections = await card('Page & sections')
    expect(sections).not.toHaveTextContent('Not editable in place')
  })
})
