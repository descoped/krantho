import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, openEditor, WARM_TIMEOUT_MS, warmEditor } from './fixtures/editor-api.js'
import { BODY, body, card, caretAt, panel, pricing, seoRoutes } from './fixtures/side-panel.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('side panel, nothing selected', () => {
  it('shows Page & sections: N / M designed, present and missing designed sections, the lead and prose', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const sections = await card('Page & sections')
    expect(await within(sections).findByText('1 / 3 designed')).toBeVisible()
    const rows = within(sections).getByRole('list', { name: 'Sections' })
    expect(within(rows).getByRole('button', { name: /^Problem\s*present$/ })).toBeVisible()
    expect(within(rows).getByRole('button', { name: 'Approach Add section' })).toBeVisible()
    expect(within(rows).getByRole('button', { name: 'Proof Add section' })).toBeVisible()
    expect(within(rows).getByRole('button', { name: /^Notes\s*prose$/ })).toBeVisible()
    expect(within(rows).getByRole('button', { name: /^Lead\s*before first ##$/ })).toBeVisible()
  })

  it('adds a missing designed section to the body and selects it, moving focus to the panel heading', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const sections = await card('Page & sections')
    await userEvent
      .setup()
      .click(within(sections).getByRole('button', { name: 'Approach Add section' }))
    expect(body().value).toBe(`${BODY}\n\n## Approach\n`)
    const heading = within(await panel()).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Section · Approach')
    expect(heading).toHaveFocus()
    expect(within(await panel()).getByRole('status')).toHaveTextContent(
      'Side panel: Section · Approach',
    )
    expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })

  it('shows Search and sharing against the configured limits: meta meter, title, social image and advice', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const search = await card('Search and sharing')
    const meta = within(search).getByText('Meta description').closest('.side-length')
    expect(meta).toHaveAttribute('data-length-state', 'under')
    expect(meta).toHaveTextContent('13 chars · target 120–155')
    expect(meta).toHaveTextContent('under the target')
    expect(meta).toHaveTextContent('Falls back to description')
    const title = within(search).getByText('Title').closest('.side-length')
    expect(title).toHaveTextContent('7 chars · limit 60')
    expect(search).toHaveTextContent('Social imageNone')
    expect(search).toHaveTextContent('Search results show the description.')
  })

  it('leaves structured data and rich results to Data mode', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const search = await card('Search and sharing')
    expect(search).not.toHaveTextContent('Structured data')
    expect(search).not.toHaveTextContent('rich results')
    expect(within(await panel()).queryByRole('region', { name: 'Findability' })).toBeNull()
    expect(within(search).queryByRole('button', { name: 'Open Data view' })).toBeNull()
  })

  it('Edit on the advice focuses the field in Structure mode, which the panel then shows', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const search = await card('Search and sharing')
    await userEvent
      .setup()
      .click(within(search).getByRole('button', { name: 'Edit meta-description' }))
    expect(screen.getByRole('textbox', { name: 'meta-description' })).toHaveFocus()
    expect(within(await panel()).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Field · meta-description',
    )
  })

  it('marks a meta description over the limit as danger and advises shortening it', async () => {
    openEditor({ doc: pricing({ 'meta-description': 'x'.repeat(170) }) }, { routes: seoRoutes() })
    const search = await card('Search and sharing')
    const meta = within(search).getByText('Meta description').closest('.side-length')
    expect(meta).toHaveAttribute('data-length-state', 'over')
    expect(meta).toHaveTextContent('over the target')
    expect(search).toHaveTextContent(
      'The meta description is 170 characters; search results cut it near 155.',
    )
  })

  it('shows no search checks, and reads nothing from SEO, when the site has no seo capability', async () => {
    const calls = openEditor(
      { doc: pricing() },
      { routes: seoRoutes(), features: { localization: 'enabled' } },
    )
    await card('Page & sections')
    // A setup matter is not the editor's to fix: no warning, no meters, no advice
    expect(within(await panel()).queryByRole('region', { name: 'Search and sharing' })).toBeNull()
    expect(within(await panel()).queryByText(/SEO is off/)).toBeNull()
    expect(calls.some((call) => call.key.startsWith('GET /api/seo/'))).toBe(false)
  })

  it('shows Reach: each locale with its status, Create draft for a missing one, and what publishing refreshes', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const reach = await card('Reach')
    const locales = within(reach).getByRole('list', { name: 'Locales' })
    const en = locales.querySelector('[data-locale="en"]') as HTMLElement
    expect(en).toHaveTextContent('Unpublished changes')
    const create = await within(locales).findByRole('button', { name: 'Create draft in NO' })
    expect(locales.querySelector('[data-locale="no"]')).toHaveTextContent('Missing')
    expect(await within(reach).findByText('/pricing')).toBeVisible()
    await userEvent.setup().click(create)
    expect(
      await screen.findByRole('dialog', { name: 'Create the NO draft of pricing?' }),
    ).toBeVisible()
  })
})

describe('side panel, a selection', () => {
  it('shows a selected field: its type, required, the SEO outputs that read it and its length meter', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    await userEvent.setup().click(screen.getByRole('textbox', { name: 'title' }))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · title')
    expect(side).toHaveTextContent('Typetext')
    expect(side).toHaveTextContent('RequiredYes')
    expect(side).toHaveTextContent('Read bytitle')
    expect(side).toHaveTextContent('7 chars · limit 60')
  })

  it('shows a selected field without length meters when SEO is off', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes(), features: { localization: 'enabled' } })
    await panel()
    await userEvent.setup().click(screen.getByRole('textbox', { name: 'description' }))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · description')
    expect(side).toHaveTextContent('Nothing: SEO does not read this document')
    expect(side.querySelector('.side-length')).toBeNull()
    expect(side).not.toHaveTextContent('Search results show')
  })

  it('shows the effective meta description, with its fallback note, for description', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    await userEvent.setup().click(screen.getByRole('textbox', { name: 'description' }))
    const side = await panel()
    expect(side).toHaveTextContent('Read bybackup for meta description')
    expect(side).toHaveTextContent('Meta description, effective')
    expect(side).toHaveTextContent('13 chars · target 120–155')
    expect(side).toHaveTextContent('Search results show this field.')
  })

  it('returns to the page overview on Esc in the panel or Page overview, focus on its heading', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: 'title' }))
    const side = await panel()
    await user.click(within(side).getByRole('button', { name: 'Page overview' }))
    const heading = within(side).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Page overview')
    expect(heading).toHaveFocus()

    await user.click(screen.getByRole('textbox', { name: 'title' }))
    within(side).getByRole('button', { name: 'Page overview' }).focus()
    await user.keyboard('{Escape}')
    expect(heading).toHaveTextContent('Page overview')
    expect(heading).toHaveFocus()
  })

  it('shows the section the caret sits in: prose, its key, word count and its own meta description field', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    caretAt(BODY.indexOf('extra'))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Section · Notes')
    expect(side).toHaveTextContent('prose')
    expect(side).toHaveTextContent('Keysections["Notes"]')
    expect(side).toHaveTextContent('Words4')
    expect(side).toHaveTextContent('Not in the contract. Rename it to a contract heading')
    const field = within(side).getByRole('textbox', { name: 'meta-description-Notes' })
    await userEvent.setup().type(field, 'Notes summary')
    expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })

  it('removes a section meta description field once it is cleared, instead of saving an empty string', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    caretAt(BODY.indexOf('extra'))
    const field = within(await panel()).getByRole('textbox', { name: 'meta-description-Notes' })
    const user = userEvent.setup()
    await user.type(field, 'Notes summary')
    await user.clear(field)
    expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows a designed section without the prose hint, and the lead before the first ##', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    caretAt(BODY.indexOf('hurts'))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Section · Problem')
    expect(side).toHaveTextContent('designed')
    expect(side).not.toHaveTextContent('Not in the contract')
    caretAt(2)
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Lead')
    expect(side).toHaveTextContent('before first ##')
    expect(side).toHaveTextContent('Words3')
  })

  it('Esc in the canvas returns to the page overview and keeps focus where it is', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    caretAt(BODY.indexOf('hurts'))
    const side = await panel()
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Section · Problem')
    await userEvent.setup().keyboard('{Escape}')
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Page overview')
    expect(body()).toHaveFocus()
  })

  it('a real Esc keydown and keyup in a field leaves the overview, and Tab or the arrows do not select again', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const side = await panel()
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: 'title' }))
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · title')
    await user.keyboard('{Escape}')
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Page overview')
    await user.keyboard('{ArrowLeft}{ArrowRight}{Home}')
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Page overview')
    // Typing in the field selects it again
    await user.keyboard('s')
    expect(within(side).getByRole('heading', { level: 2 })).toHaveTextContent('Field · title')
  })
})
