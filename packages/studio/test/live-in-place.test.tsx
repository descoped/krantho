import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NOTHING_SELECTED } from '../src/editor/side-panel/selection.js'
import {
  byId,
  frame,
  frameWindow,
  liveModeHooks,
  loadPage,
  renderLive,
} from './fixtures/live-mode.js'

liveModeHooks()

/** A page whose title and description render as text, one of them twice, and a field with markup in it */
const PAGE = `
  <h1 id="title" data-krantho-document="pages/pricing" data-krantho-field="title">Pricing</h1>
  <p id="description" data-krantho-document="pages/pricing" data-krantho-field="description">What it costs</p>
  <h2 id="again" data-krantho-document="pages/pricing" data-krantho-field="title">Pricing</h2>
  <h3 id="rich" data-krantho-document="pages/pricing" data-krantho-field="meta-description"><b>Bold</b> words</h3>
  <p id="labelled" data-krantho-document="pages/pricing" data-krantho-field="description">In short: What it costs</p>
`

const TITLE = { kind: 'field', name: 'title' }

/** Open the page and click a field's element, as a person does */
function open(id: string, more: Parameters<typeof renderLive>[0] = {}) {
  const spies = renderLive(more)
  const doc = loadPage(PAGE)
  const element = byId(doc, id) as HTMLElement
  fireEvent.click(element)
  return { spies, doc, element }
}

/** Type into the element as a browser does: its text changes, then it reports an input */
function type(element: HTMLElement, text: string): void {
  element.textContent = text
  fireEvent.input(element)
}

describe('a plain-text field edited in the page itself', () => {
  it('makes the clicked element editable, named after the field, with focus and no floating editor', () => {
    const { spies, doc, element } = open('title')
    expect(element).toHaveAttribute('contenteditable', 'plaintext-only')
    expect(doc.activeElement).toBe(element)
    expect(within(doc.body).getByRole('textbox', { name: 'Edit field title' })).toBe(element)
    expect(document.querySelector('.live-editor')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(spies.onSelect).toHaveBeenLastCalledWith(TITLE, false)
    // Selected with a ring of its own: the element is being typed into
    expect(document.querySelector('.live-outline--selected.live-outline--editing')).not.toBeNull()
    // The other element for the field is not editable
    expect(byId(doc, 'again')).not.toHaveAttribute('contenteditable')
  })

  it('shows context beside the element and Done finishes while retaining the draft and returning focus', async () => {
    const { spies, element } = open('title')
    type(element, 'Plans')
    const context = screen.getByRole('group', { name: 'Editing Page title' })
    expect(context).toHaveTextContent('Draft')
    await userEvent.setup().click(within(context).getByRole('button', { name: 'Done editing' }))
    expect(element).not.toHaveAttribute('contenteditable')
    expect(spies.draft().fields.title).toBe('Plans')
    expect(screen.queryByRole('group', { name: 'Editing Page title' })).toBeNull()
    expect(frame()).toHaveFocus()
  })

  it('cancel restores only this element’s field, including its repeated renderings', async () => {
    const { spies, doc, element } = open('description')
    type(element, 'A description to keep')
    fireEvent.click(byId(doc, 'title'))
    const title = byId(doc, 'title') as HTMLElement
    type(title, 'Discard this title')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel this element’s edit' }))
    expect(spies.draft().fields.title).toBe('Pricing')
    expect(spies.draft().fields.description).toBe('A description to keep')
    expect(byId(doc, 'again')).toHaveTextContent('Pricing')
    expect(title).not.toHaveAttribute('contenteditable')
    expect(frame()).toHaveFocus()
  })

  it('the toolbar names the element without a duplicate technical tag', () => {
    open('title')
    expect(screen.getByRole('group', { name: 'Editing Page title' })).toHaveTextContent(
      'Page title',
    )
    expect(document.querySelector('.live-outline--editing .live-tag')).toBeNull()
  })

  it('finishes when blank space in the preview is clicked, keeping the edited text', () => {
    const { spies, doc, element } = open('title')
    type(element, 'Plans')
    fireEvent.click(doc.body)
    expect(element).not.toHaveAttribute('contenteditable')
    expect(spies.draft().fields.title).toBe('Plans')
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
  })

  it('finishes when blank space outside the preview is clicked', () => {
    const { element } = open('title')
    fireEvent.pointerDown(document.body)
    expect(element).not.toHaveAttribute('contenteditable')
  })

  it('keeps Done reachable by keyboard, and Esc there returns focus to the frame', async () => {
    const { element } = open('title')
    const done = screen.getByRole('button', { name: 'Done editing' })
    done.focus()
    element.blur()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(element).toHaveAttribute('contenteditable')
    fireEvent.keyDown(done, { key: 'Escape' })
    expect(element).not.toHaveAttribute('contenteditable')
    expect(frame()).toHaveFocus()
  })

  it('has no list to choose from: the page is clicked, and Structure is the keyboard’s way', () => {
    renderLive()
    loadPage(PAGE)
    expect(screen.queryByText('Choose editable content')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/To edit with the keyboard, use Structure/)).toBeVisible()
  })

  it('writes the field with the typed text and patches the page’s other renderings of it', () => {
    const { spies, doc, element } = open('title')
    type(element, 'Pricing & plans')
    expect(spies.draft().fields.title).toBe('Pricing & plans')
    expect(byId(doc, 'again').textContent).toBe('Pricing & plans')
    expect(element.textContent).toBe('Pricing & plans')
  })

  it('puts the caret at the end of the text when there is no click point', () => {
    const { doc, element } = open('title')
    const selection = doc.getSelection()
    expect(selection?.isCollapsed).toBe(true)
    expect(selection?.anchorNode).toBe(element)
    expect(selection?.anchorOffset).toBe(element.childNodes.length)
  })

  it('puts the caret where the click landed', () => {
    renderLive()
    const doc = loadPage(PAGE)
    const element = byId(doc, 'title')
    const offsetNode = element.firstChild as Text
    doc.caretPositionFromPoint = () => ({ offsetNode, offset: 3, getClientRect: () => null })
    fireEvent.click(element, { detail: 1, clientX: 12, clientY: 40 })
    expect(doc.getSelection()?.anchorOffset).toBe(3)
  })

  it('Enter finishes a one-line field: the page is as the site rendered it, plus the typed text', () => {
    const { spies, doc, element } = open('title')
    type(element, 'Plans')
    fireEvent.keyDown(element, { key: 'Enter' })
    expect(element.outerHTML).toBe(
      '<h1 id="title" data-krantho-document="pages/pricing" data-krantho-field="title">Plans</h1>',
    )
    expect(document.querySelector('.live-outline--selected')).toBeNull()
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
    expect(spies.draft().fields.title).toBe('Plans')
    // Focus goes back to where it was: the frame
    expect(frame()).toHaveFocus()
    expect(doc.activeElement).not.toBe(element)
  })

  it('Esc finishes it and keeps what was typed', () => {
    const { spies, element } = open('title')
    type(element, 'Plans')
    const reached = fireEvent.keyDown(element, { key: 'Escape' })
    // The page's own Esc handling is not reached: it would only clear the selection
    expect(reached).toBe(false)
    expect(element).not.toHaveAttribute('contenteditable')
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
    expect(spies.draft().fields.title).toBe('Plans')
  })

  it('finishes when focus goes elsewhere, and leaves focus where it went', async () => {
    const { spies, doc, element } = open('title')
    // Studio's own control takes focus, as a click on it does
    const select = document.body.appendChild(document.createElement('button'))
    select.focus()
    element.blur()
    await waitFor(() => expect(element).not.toHaveAttribute('contenteditable'))
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
    expect(doc.activeElement).not.toBe(element)
    expect(select).toHaveFocus()
  })

  it('stays editable while a click lands in the element, and does not announce the selection again', () => {
    const { spies, element } = open('title')
    const announced = spies.onSelect.mock.calls.length
    fireEvent.click(element, { detail: 1 })
    expect(element).toHaveAttribute('contenteditable', 'plaintext-only')
    expect(spies.onSelect.mock.calls.length).toBe(announced)
  })

  it('does not become editable when the form is read-only: it selects, and the panel takes focus', () => {
    const { spies, element } = open('title', { readOnly: true })
    expect(element).not.toHaveAttribute('contenteditable')
    expect(spies.onSelect).toHaveBeenLastCalledWith(TITLE, true)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('stops being editable when the form becomes read-only under it', () => {
    const { spies, element } = open('title')
    spies.rerender({ readOnly: true })
    expect(element).not.toHaveAttribute('contenteditable')
  })

  it('closes, saying why, when the field changes from outside the editor', () => {
    const { spies, element } = open('title')
    spies.rerender({
      draft: {
        metadata: {},
        fields: { title: 'Restored' },
        body: spies.draft().body,
      },
    })
    expect(element).not.toHaveAttribute('contenteditable')
    expect(document.querySelector('.live-notice')?.textContent).toBe(
      'The field changed elsewhere; open it again to edit.',
    )
  })

  it('ends with the page when Save reloads the preview, keeping the selection', () => {
    const { spies, element } = open('title')
    spies.rerender({ savedVersion: 4 })
    // The page the element was in is gone as the reload starts
    expect(element).not.toHaveAttribute('contenteditable')
    const doc = loadPage(PAGE)
    expect(byId(doc, 'title')).not.toHaveAttribute('contenteditable')
    expect(spies.onSelect).toHaveBeenLastCalledWith(TITLE, false)
    expect(document.querySelector('.live-outline--selected')).not.toBeNull()
  })

  it('falls back to the floating editor for an element with child elements, whose markup would be lost', () => {
    const { spies, doc, element } = open('rich')
    expect(element).not.toHaveAttribute('contenteditable')
    expect(element.querySelector('b')).not.toBeNull()
    const input = screen.getByRole('textbox', { name: 'Edit field meta-description' })
    expect(input).toHaveFocus()
    expect(spies.onSelect).toHaveBeenLastCalledWith(
      { kind: 'field', name: 'meta-description' },
      false,
    )
    expect(within(doc.body).queryByRole('textbox')).toBeNull()
    expect(document.querySelector('.live-outline--editing')).toBeNull()
  })
})

describe('a field whose element shows more than its value', () => {
  it('keeps the floating editor, so the page’s own words never go into the field', () => {
    const { spies, doc, element } = open('labelled')
    expect(element).not.toHaveAttribute('contenteditable')
    expect(screen.getByRole('textbox', { name: 'Edit field description' })).toHaveFocus()
    expect(within(doc.body).queryByRole('textbox')).toBeNull()
    expect(spies.draft().fields.description).toBe('What it costs')
  })
})

describe('line breaks and pasted text in a field edited in the page', () => {
  it('a multi-line field keeps Enter for the browser and shows line breaks while it is edited', () => {
    const { spies, element } = open('description')
    expect(element.style.whiteSpace).toBe('pre-wrap')
    expect(fireEvent.keyDown(element, { key: 'Enter' })).toBe(true)
    expect(element).toHaveAttribute('contenteditable', 'plaintext-only')
    type(element, 'Line one\nLine two')
    expect(spies.draft().fields.description).toBe('Line one\nLine two')
    fireEvent.keyDown(element, { key: 'Escape' })
    expect(element).not.toHaveAttribute('style')
    expect(element).not.toHaveAttribute('role')
    expect(element).not.toHaveAttribute('aria-label')
  })

  it('pastes plain text on one line into a one-line field', () => {
    const { spies, element } = open('title')
    fireEvent.paste(element, { clipboardData: { getData: () => 'Plans\n and more' } })
    expect(spies.draft().fields.title).toBe('PricingPlans and more')
  })

  it('pastes its line breaks into a multi-line field', () => {
    const { spies, element } = open('description')
    fireEvent.paste(element, { clipboardData: { getData: () => '!\r\nMore' } })
    expect(spies.draft().fields.description).toBe('What it costs!\nMore')
  })

  it('refuses a drop: only typed or pasted text goes in', () => {
    const { element } = open('title')
    expect(fireEvent.drop(element)).toBe(false)
  })

  it('where the browser has no plain-text editing, edits as `true` and keeps line breaks as characters', () => {
    renderLive()
    const doc = loadPage(PAGE)
    const win = frameWindow() as Window & typeof globalThis
    Object.defineProperty(win.HTMLElement.prototype, 'contentEditable', {
      get: () => 'inherit',
      configurable: true,
    })
    const element = byId(doc, 'description') as HTMLElement
    fireEvent.click(element)
    expect(element).toHaveAttribute('contenteditable', 'true')
    act(() => {
      fireEvent.keyDown(element, { key: 'Enter' })
    })
    expect(element.childElementCount).toBe(0)
    expect(element.textContent).toBe('What it costs\n')
    expect(element).toHaveAttribute('contenteditable', 'true')
  })
})
