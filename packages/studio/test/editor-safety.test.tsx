import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aheadDoc,
  contentOf,
  header,
  KEPT_REGION,
  memoryStorage,
  openEditor,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { json } from './fixtures/site-api.js'

const KEY = 'krantho-autosave-pages-pricing-en'

/** Longer than the editor waits after a change before it keeps the work */
const pastKeeping = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1000))

function keep(entry: Record<string, unknown>): string {
  const raw = JSON.stringify({ savedAt: '2026-10-02T09:00:00.000Z', ...entry })
  localStorage.setItem(KEY, raw)
  return raw
}

async function leaveForPulse(): Promise<HTMLElement> {
  const nav = screen.getByRole('navigation', { name: 'Studio' })
  await userEvent.setup().click(within(nav).getByRole('link', { name: 'Pulse' }))
  return screen.findByRole('dialog', { name: 'Leave without saving?' })
}

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('leaving', () => {
  it('asks before leaving with unsaved changes, says they are kept; Stay keeps the work', async () => {
    openEditor({ doc: aheadDoc() })
    await header()
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'title' }), '!')
    const dialog = await leaveForPulse()
    expect(dialog).toHaveTextContent('They stay in this browser and are offered back')
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Pricing!')
  })
})

describe('kept work', () => {
  it('offers kept work back, and Restore puts it in the form', async () => {
    keep({
      metadata: {},
      fields: { title: 'Kept title' },
      body: 'Kept body',
      baseVersion: 3,
    })
    openEditor({ doc: aheadDoc() })
    await header()
    const notice = await screen.findByRole('region', { name: KEPT_REGION })
    expect(notice).toHaveTextContent('made on v3')
    await userEvent.setup().click(within(notice).getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Kept title')
    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveValue('Kept body')
    expect(screen.queryByRole('region', { name: KEPT_REGION })).toBeNull()
  })

  it('says the document moved on; restored older work saves as a conflict, overwriting is a separate choice', async () => {
    keep({
      metadata: {},
      fields: { title: 'Kept title' },
      body: 'Kept body',
      baseVersion: 2,
    })
    const calls = openEditor({ doc: aheadDoc() })
    const bar = await header()
    const user = userEvent.setup()
    const notice = await screen.findByRole('region', { name: KEPT_REGION })
    expect(notice).toHaveTextContent('made on v2 — the document is now v3')
    await user.click(within(notice).getByRole('button', { name: 'Restore' }))
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))

    const refusal = await screen.findByText(/v3 was saved after v2/)
    expect(refusal).toHaveTextContent('Nothing was saved')
    expect(refusal).toHaveTextContent('They are also kept in this browser; reload to see v3.')
    expect(refusal.textContent).not.toMatch(/overwrite|save again/i)
    const puts = (): unknown[] =>
      calls.filter((call) => call.key === 'PUT /api/content/pages/pricing').map((c) => c.body)
    expect(puts()).toEqual([expect.objectContaining({ _version: 2 })])

    await user.click(screen.getByRole('button', { name: 'Overwrite v3 with my changes' }))
    expect(await screen.findByText(/^Draft saved · v4\./)).toBeInTheDocument()
    expect(puts()[1]).toMatchObject({ _version: 3, fields: { title: 'Kept title' } })
  })

  it('does not offer work that does not name the version it was made on', async () => {
    keep({
      metadata: {},
      fields: { title: 'Kept title' },
      body: 'Kept body',
    })
    openEditor({ doc: aheadDoc() })
    await header()
    expect(await screen.findByRole('textbox', { name: 'title' })).toHaveValue('Pricing')
    expect(screen.queryByRole('region', { name: KEPT_REGION })).toBeNull()
  })

  it('keeps an offer’s slot while it waits: typing does not overwrite it, and leaving says so', async () => {
    const raw = keep({
      metadata: {},
      fields: { title: 'Kept title' },
      body: 'Kept body',
      baseVersion: 3,
    })
    openEditor({ doc: aheadDoc() })
    await header()
    await screen.findByRole('region', { name: KEPT_REGION })
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'title' }), ' typed')
    await pastKeeping()
    expect(localStorage.getItem(KEY)).toBe(raw)
    const dialog = await leaveForPulse()
    expect(dialog).toHaveTextContent('They are not kept')
  })
})

describe('saving while typing', () => {
  it('keeps what was typed while the save was in flight, unsaved and kept', async () => {
    let answer = (): void => undefined
    const saveGate = new Promise<void>((resolve) => {
      answer = resolve
    })
    openEditor({ doc: aheadDoc(), saveGate })
    const bar = await header()
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'title' }), ' plans')
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    await user.type(screen.getByRole('textbox', { name: 'description' }), ' today')
    answer()

    expect(await screen.findByText(/^Draft saved · v4\./)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Pricing plans')
    expect(screen.getByRole('textbox', { name: 'description' })).toHaveValue('What it costs today')
    expect(within(bar).getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({
        fields: { title: 'Pricing plans', description: 'What it costs today' },
        baseVersion: 4,
      }),
    )
  })
})

describe('changing the status', () => {
  it('waits for unsaved changes to be saved: Unpublish and Archive say so and do nothing', async () => {
    const calls = openEditor({ doc: aheadDoc() })
    const bar = await header()
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'title' }), ' plans')
    await user.click(within(bar).getByRole('button', { name: 'Unpublished changes' }))
    for (const name of ['Unpublish', 'Archive']) {
      const action = within(bar).getByRole('button', { name })
      expect(action).toHaveAttribute('aria-disabled', 'true')
      expect(action).toHaveAccessibleDescription('Save the draft first')
      await user.click(action)
    }
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.some((call) => call.key === 'POST /api/content/pages/pricing/publish')).toBe(false)
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Pricing plans')
  })

  it('waits for a version conflict to be answered, and leaves its notice standing', async () => {
    keep({
      metadata: {},
      fields: { title: 'Kept title' },
      body: 'Kept body',
      baseVersion: 2,
    })
    openEditor({ doc: aheadDoc() })
    const bar = await header()
    const user = userEvent.setup()
    const notice = await screen.findByRole('region', { name: KEPT_REGION })
    await user.click(within(notice).getByRole('button', { name: 'Restore' }))
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    const refusal = await screen.findByText(/v3 was saved after v2/)
    await user.click(within(bar).getByRole('button', { name: 'Unpublished changes' }))
    const unpublish = within(bar).getByRole('button', { name: 'Unpublish' })
    expect(unpublish).toHaveAccessibleDescription('Answer the version conflict first')
    await user.click(unpublish)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(refusal).toBeInTheDocument()
  })

  it('brings an archived document back to draft without publishing, after a confirmation', async () => {
    const doc = { ...aheadDoc(), liveVersion: null, status: 'archived' as const }
    const calls = openEditor({ doc })
    const bar = await header()
    const user = userEvent.setup()
    await user.click(within(bar).getByRole('button', { name: 'Not published' }))
    expect(within(bar).queryByRole('button', { name: 'Archive' })).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Restore to draft' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore pricing to draft?' })
    expect(dialog).toHaveTextContent('Nothing is published.')
    await user.click(within(dialog).getByRole('button', { name: 'Restore to draft' }))
    expect(await screen.findByText(/^pricing is a draft again\./)).toBeVisible()
    const change = calls.find((call) => call.key === 'POST /api/content/pages/pricing/publish')
    expect(change?.body).toMatchObject({ status: 'draft' })
  })
})

describe('a save whose follow-up read fails', () => {
  it('takes the version from the save’s answer, so the next save does not conflict with it', async () => {
    const doc = aheadDoc()
    let reads = 0
    const calls = openEditor(
      { doc },
      {
        routes: {
          'GET /api/content/pages/pricing': () => {
            reads += 1
            return reads === 1 ? json(contentOf(doc)) : json({ error: 'Broken' }, 500)
          },
        },
      },
    )
    const bar = await header()
    const user = userEvent.setup()
    const title = await screen.findByRole('textbox', { name: 'title' })
    await user.type(title, ' plans')
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/^Draft saved · v4\./)).toBeInTheDocument()
    await user.type(title, ' today')
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/^Draft saved · v5\./)).toBeInTheDocument()
    const puts = calls.filter((c) => c.key === 'PUT /api/content/pages/pricing')
    expect(puts.map((put) => (put.body as { _version: number })._version)).toEqual([3, 4])
  })
})
