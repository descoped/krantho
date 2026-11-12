import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  byId,
  frame,
  frameWindow,
  liveModeHooks,
  loadPage,
  renderLive,
  replaceRichText,
  richEditor,
  typeInto,
} from './fixtures/live-mode.js'

liveModeHooks()

/** Leave the page by a client-side navigation: no load, only a new address */
async function navigateAway(doc: Document): Promise<void> {
  act(() => {
    frameWindow().history.pushState(null, '', '/about')
  })
  fireEvent.mouseOver(byId(doc, 'title-link'))
  await screen.findByText('/about')
}

function notice(): string {
  return document.querySelector('.live-notice')?.textContent ?? ''
}

describe('Live mode never drops focus to the page body when the frame changes', () => {
  it('Reload the preview from the empty state: focus goes to the new frame', async () => {
    renderLive()
    Object.defineProperty(frame(), 'contentDocument', { get: () => null, configurable: true })
    fireEvent.load(frame())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload the preview' }))
    expect(document.activeElement).toBe(frame())
  })

  it('Back to the page: focus goes to the frame, which starts again', async () => {
    renderLive()
    const doc = loadPage()
    await navigateAway(doc)
    const before = frame()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to the page' }))
    expect(frame()).not.toBe(before)
    expect(document.activeElement).toBe(frame())
  })

  it('the frame moves while the visual editor has focus: focus remains in the page, with an alert', async () => {
    renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    const rich = await richEditor(doc)
    expect(doc.activeElement).toBe(rich)
    await navigateAway(doc)
    expect(screen.queryByRole('textbox', { name: 'Edit section Problem' })).toBeNull()
    expect(document.activeElement).toBe(frame())
    expect(screen.getByRole('alert')).toHaveTextContent('The preview moved to /about')
  })

  it('a move with focus in the page itself leaves focus where it is', async () => {
    renderLive()
    const doc = loadPage()
    frame().focus()
    await navigateAway(doc)
    expect(document.activeElement).toBe(frame())
  })
})

describe('Live mode when Save reloads the preview while the inline editor is open', () => {
  it('Save reloads the page, closes its old editor and preserves the typed draft', async () => {
    const live = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'What hurts. Ouch')
    const before = frame()
    live.rerender({ savedVersion: 4 })
    expect(frame()).not.toBe(before)
    expect(doc.querySelector('.ProseMirror')).toBeNull()
    expect(live.draft().body).toContain('What hurts. Ouch')
    loadPage()
    expect(notice()).toBe('')
  })

  it('a body changed by the save closes the editor, keeps the selection, and focuses the frame', async () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'What hurts. Ouch')
    const selected = spies.onSelect.mock.lastCall?.[0]
    // The saved version comes back with its body as the server keeps it
    spies.replaceBody('Lead words.\n\n## Problem\n\nWhat hurts. Ouch\n\n## Notes\n\nMore.\n')
    expect(screen.queryByRole('textbox', { name: 'Edit section Problem' })).toBeNull()
    expect(notice()).toBe('The section changed elsewhere; open it again to edit.')
    spies.rerender({ savedVersion: 4 })
    expect(document.activeElement).toBe(frame())
    // The reloaded page is scanned, and the selected section is outlined on it again
    loadPage()
    expect(document.querySelector('.live-outline--selected')).not.toBeNull()
    expect(spies.onSelect.mock.lastCall?.[0]).toEqual(selected)
  })
})

describe('Live mode says what changed elsewhere', () => {
  it('a field changed outside the inline editor closes it with the field wording', () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    const input = screen.getByRole('textbox', { name: 'Edit field title' })
    typeInto(input, 's')
    // A change to the body leaves the field as the editor wrote it: it stays open
    spies.replaceBody(`${spies.draft().body}\n\nMore words.`)
    expect(screen.getByRole('textbox', { name: 'Edit field title' })).toBe(input)
    expect(notice()).toBe('')
    spies.rerender({
      draft: {
        metadata: {},
        fields: { title: 'Restored' },
        body: spies.draft().body,
      },
    })
    expect(screen.queryByRole('textbox', { name: 'Edit field title' })).toBeNull()
    expect(notice()).toBe('The field changed elsewhere; open it again to edit.')
    expect(document.activeElement).toBe(frame())
  })

  it('a section keeps the section wording', async () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await richEditor(doc)
    spies.replaceBody(`${spies.draft().body}\n\nrestored`)
    expect(notice()).toBe('The section changed elsewhere; open it again to edit.')
    expect(document.activeElement).not.toBe(document.body)
  })
})
