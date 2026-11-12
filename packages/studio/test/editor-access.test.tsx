import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aheadDoc,
  foreignLock,
  header,
  heldLock,
  memoryStorage,
  openEditor,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'

/** The canvas's read-only notice: a status region that is always in the page */
function readOnlyNotice(): HTMLElement {
  const canvas = screen.getByRole('tabpanel')
  const notice = within(canvas)
    .getAllByRole('status')
    .find((region) => region.classList.contains('editor-readonly'))
  if (!notice) throw new Error('no read-only notice')
  return notice
}

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a read-only editor', () => {
  it('says in the canvas who holds the lock', async () => {
    openEditor({ doc: aheadDoc(), lockedBy: 'editor:other@e2e.local' })
    await header()
    expect(await screen.findByText(/^Read-only: other@e2e\.local is editing\./)).toBe(
      readOnlyNotice(),
    )
  })

  it('tells a viewer why the form is read-only', async () => {
    openEditor({ doc: aheadDoc() }, { role: 'viewer' })
    await header()
    expect(readOnlyNotice()).toHaveTextContent(
      'Read-only: your role can view documents but not edit them.',
    )
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled()
  })

  it('offers Promote of a custom field only to an admin', async () => {
    const doc = { ...aheadDoc(), fields: { title: 'Pricing', extra: 'kept' } }
    openEditor({ doc }, { role: 'editor' })
    const custom = await screen.findByRole('region', { name: 'Custom fields' })
    expect(within(custom).queryByRole('button', { name: /^Promote/ })).toBeNull()
    expect(custom).not.toHaveTextContent('Promote one')
    cleanup()
    openEditor({ doc }, { role: 'admin' })
    const own = await screen.findByRole('region', { name: 'Custom fields' })
    expect(
      within(own).getByRole('button', { name: 'Promote extra to a schema field' }),
    ).toBeVisible()
  })

  it('announces a lock turning foreign while someone types, and moves focus to the notice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    openEditor({
      doc: aheadDoc(),
      locks: [heldLock, foreignLock('editor:other@e2e.local')],
    })
    await header()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const title = await screen.findByRole('textbox', { name: 'title' })
    await user.click(title)
    expect(title).toHaveFocus()
    // The held lock is renewed at half its minute-long lease: then someone else holds it
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })
    expect(title).toBeDisabled()
    const notice = readOnlyNotice()
    expect(notice).toHaveTextContent('Read-only: other@e2e.local is editing.')
    expect(notice).toHaveFocus()
  })

  it('announces the form opening again when the other lock goes, and keeps focus in reach', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    openEditor({ doc: aheadDoc(), locks: [foreignLock('editor:other@e2e.local'), heldLock] })
    const bar = await header()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const chip = await within(bar).findByRole('button', { name: 'other@e2e.local is editing' })
    await user.click(chip)
    expect(chip).toHaveFocus()
    // Someone else's lock is asked about again every half minute: then it is gone
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })
    expect(chip).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'title' })).toBeEnabled()
    const notice = readOnlyNotice()
    expect(notice).toHaveTextContent('Editing is open again.')
    expect(notice).toHaveFocus()
  })

  it('opens the media picker outside the form, so a lock change cannot disable it', async () => {
    openEditor({ doc: aheadDoc() }, { pending: ['/api/media'] })
    const hero = await screen.findByRole('group', { name: 'hero' })
    await userEvent.setup().click(within(hero).getByRole('button', { name: 'Choose image' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose an image' })
    expect(dialog.closest('fieldset')).toBeNull()
    expect(dialog.closest('.editor-canvas')).toBeNull()
  })
})
