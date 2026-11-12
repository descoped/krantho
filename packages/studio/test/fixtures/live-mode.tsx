import { act, fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { Draft } from '../../src/editor/editor-model.js'
import { LiveMode, type LiveModeProps } from '../../src/editor/live-mode.js'
import { NOTHING_SELECTED, type PanelSelection } from '../../src/editor/side-panel/selection.js'
import { memoryStorage, SCHEMA } from './editor-api.js'

/**
 * Live mode on a frame jsdom fills by hand: the harness that holds the
 * editor's draft and the panel's selection, and the page the site would
 * render in its preview
 */

/** Each Live mode test file's setup: its own storage, real timers and globals after */
export function liveModeHooks(): void {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
}

export const SRC = '/api/preview?collection=pages&slug=pricing'
export const PATH = '/pricing'
export const TITLE = 'Draft preview of pages/pricing'
export const BODY = 'Lead words.\n\n## Problem\n\nWhat hurts.\n\n## Notes\n\nMore.'

/**
 * The page as the site renders it in a preview: some of the document's
 * marks, a description rendered without one, and another document's marks
 */
export const PAGE = `
  <h1 id="title" data-krantho-document="pages/pricing" data-krantho-field="title"><a id="title-link" href="/elsewhere">Pricing</a></h1>
  <p id="description">What it costs</p>
  <div id="problem" data-krantho-document="pages/pricing" data-krantho-section="Problem" style="display:contents"><h2 id="problem-h">Problem</h2><p id="problem-p">What hurts.</p></div>
  <h3 id="card" data-krantho-document="pages/about" data-krantho-field="title">About</h3>
`

export interface Spies {
  onSelect: ReturnType<typeof vi.fn>
  onFound: ReturnType<typeof vi.fn>
  onStructure: ReturnType<typeof vi.fn>
  draft: () => Draft
}

/** Live mode with the editor's draft and the panel's selection held as the editor holds them */
export function renderLive(
  overrides: Partial<LiveModeProps> = {},
  body = BODY,
): Spies & {
  rerender: (more: Partial<LiveModeProps>) => void
  /** Replace the body from outside Live mode: kept work restored, a rebase */
  replaceBody: (body: string) => void
} {
  const spies = { onSelect: vi.fn(), onFound: vi.fn(), onStructure: vi.fn() }
  let current: Draft = {
    metadata: {},

    fields: { title: 'Pricing', description: 'What it costs', hero: 'm1' },
    body,
  }
  let replace: (body: string) => void = () => undefined
  function Harness(more: Partial<LiveModeProps>): ReactElement {
    const [draft, setDraft] = useState<Draft>(current)
    const [selection, setSelection] = useState<PanelSelection>(NOTHING_SELECTED)
    current = draft
    replace = (next) => setDraft((d) => ({ ...d, body: next }))
    return (
      <LiveMode
        preview={{ src: SRC, path: PATH }}
        collection="pages"
        slug="pricing"
        schema={SCHEMA}
        draft={draft}
        designed={['Problem', 'Approach']}
        readOnly={false}
        savedVersion={3}
        selection={selection}
        onField={(name, value) =>
          setDraft((d) => ({ ...d, fields: { ...d.fields, [name]: value } }))
        }
        onBody={(body) => setDraft((d) => ({ ...d, body }))}
        onFound={spies.onFound}
        onStructure={spies.onStructure}
        onSelect={(next, focus) => {
          spies.onSelect(next, focus)
          setSelection(next)
        }}
        {...more}
      />
    )
  }
  const view = render(<Harness {...overrides} />)
  return {
    ...spies,
    draft: () => current,
    rerender: (more) => view.rerender(<Harness {...overrides} {...more} />),
    replaceBody: (next) => act(() => replace(next)),
  }
}

/** Type into a box one character at a time, as a person does */
export function typeInto(box: HTMLElement, text: string): void {
  for (const char of text) {
    fireEvent.change(box, { target: { value: `${(box as HTMLTextAreaElement).value}${char}` } })
  }
}

export function frame(): HTMLIFrameElement {
  return screen.getByTitle(TITLE) as HTMLIFrameElement
}

export function frameWindow(): Window {
  const win = frame().contentWindow
  if (!win) throw new Error('the frame has no window')
  return win
}

/**
 * Fill the frame's document as the site would at a path — the page's, after
 * the preview entry's redirect, unless a test says otherwise — give its
 * elements boxes down the page, and let it load. `status` is what the
 * browser reports the page was answered with; 0, as in jsdom, is none.
 */
export function loadPage(html = PAGE, path = PATH, status = 0): Document {
  const doc = frame().contentDocument
  if (!doc) throw new Error('the frame has no document')
  // jsdom fetches nothing: the frame's document is empty until the test writes the page
  const root = doc.documentElement ?? doc.appendChild(doc.createElement('html'))
  const body = doc.body ?? root.appendChild(doc.createElement('body'))
  body.innerHTML = html
  const win = frameWindow() as Window & typeof globalThis
  // ProseMirror measures caret ranges; jsdom has no layout implementation.
  win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  win.Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect
  Range.prototype.getClientRects = win.Range.prototype.getClientRects
  Range.prototype.getBoundingClientRect = win.Range.prototype.getBoundingClientRect
  win.history.replaceState(null, '', path)
  win.performance.getEntriesByType = () =>
    [{ responseStatus: status }] as unknown as PerformanceEntryList
  // jsdom lays nothing out: scrolling to an element of the page does nothing
  win.Element.prototype.scrollIntoView = () => undefined
  ;[...body.querySelectorAll('*')].forEach((element, index) => {
    const box = { top: 40 + index * 30, left: 10, width: 200, height: 20 }
    element.getBoundingClientRect = () =>
      ({ ...box, x: box.left, y: box.top, right: 210, bottom: box.top + 20 }) as DOMRect
  })
  fireEvent.load(frame())
  return doc
}

export function byId(doc: Document, id: string): Element {
  const element = doc.getElementById(id)
  if (!element) throw new Error(`no #${id}`)
  return element
}

export function tags(): string[] {
  return [...document.querySelectorAll('.live-tag')].map((tag) => tag.textContent ?? '')
}

/** Wait for the lazy-loaded visual editor in the preview document. */
export async function richEditor(
  doc: Document,
  name = 'Edit section Problem',
): Promise<HTMLElement> {
  const { within } = await import('@testing-library/react')
  const editor = await within(doc.body).findByRole('textbox', { name })
  await act(async () => {
    await Promise.resolve()
  })
  return editor
}

/** A browser contenteditable input, observed by ProseMirror before assertions read the draft. */
export async function replaceRichText(editor: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    const paragraph = editor.ownerDocument.createElement('p')
    paragraph.textContent = text
    editor.replaceChildren(paragraph)
    fireEvent.input(editor)
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

/** Move the browser selection inside the real rich editor, without changing its content. */
export async function selectRich(
  editor: HTMLElement,
  selector: string,
  all = false,
): Promise<void> {
  const node = editor.querySelector(selector)
  if (!node) throw new Error(`missing ${selector}`)
  const doc = editor.ownerDocument
  await act(async () => {
    if (doc.activeElement !== editor) {
      // jsdom does not consistently treat an adopted contenteditable as focusable.
      editor.tabIndex = 0
      editor.focus()
      // ProseMirror briefly suppresses selection updates while restoring focus.
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    const range = doc.createRange()
    range.selectNodeContents(node)
    if (!all) range.collapse(true)
    doc.getSelection()?.removeAllRanges()
    doc.getSelection()?.addRange(range)
    doc.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}
