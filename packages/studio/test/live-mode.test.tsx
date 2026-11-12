import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NOTHING_SELECTED } from '../src/editor/side-panel/selection.js'
import {
  byId,
  frame,
  liveModeHooks,
  loadPage,
  PAGE,
  renderLive,
  replaceRichText,
  richEditor,
  SRC,
  tags,
} from './fixtures/live-mode.js'

liveModeHooks()

describe('Live mode on the draft preview', () => {
  it('loads the preview entry in a titled frame and outlines a hovered mark of the document with its tag', () => {
    renderLive()
    expect(frame()).toHaveAttribute('src', SRC)
    const doc = loadPage()
    fireEvent.mouseOver(byId(doc, 'title-link'))
    expect(tags()).toEqual(['field · title'])
    fireEvent.mouseOver(byId(doc, 'problem-p'))
    expect(tags()).toEqual(['section · Problem · designed'])
    // Marks of another document are ignored
    fireEvent.mouseOver(byId(doc, 'card'))
    expect(tags()).toEqual([])
  })

  it('reports a hover only when the marked element changes', () => {
    const spies = renderLive()
    const doc = loadPage()
    const found = spies.onFound.mock.calls.length
    fireEvent.mouseOver(byId(doc, 'title-link'))
    const outline = document.querySelector('.live-outline')
    fireEvent.mouseOver(byId(doc, 'title'))
    expect(document.querySelector('.live-outline')).toBe(outline)
    expect(spies.onFound.mock.calls.length).toBe(found)
  })

  it('a click selects the element in the side panel without navigating, and opens the labelled inline editor', () => {
    const spies = renderLive()
    const doc = loadPage()
    const reached = vi.fn()
    doc.body.addEventListener('click', reached)
    expect(fireEvent.click(byId(doc, 'title-link'))).toBe(false)
    expect(reached).not.toHaveBeenCalled()
    expect(spies.onSelect).toHaveBeenLastCalledWith({ kind: 'field', name: 'title' }, false)
    expect(screen.getByRole('textbox', { name: 'Edit field title' })).toHaveFocus()
    // A click on another document's mark is the page's own
    expect(fireEvent.click(byId(doc, 'card'))).toBe(true)
  })

  it('typing in the inline editor updates the draft and changes the element in the frame at once', async () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    await userEvent
      .setup()
      .type(screen.getByRole('textbox', { name: 'Edit field title' }), ' & plans')
    expect(spies.draft().fields.title).toBe('Pricing & plans')
    expect(byId(doc, 'title').textContent).toBe('Pricing & plans')
  })

  it('edits only the section a duplicated heading names: the second mark is the second section', async () => {
    const body = 'Lead.\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.\n'
    const spies = renderLive({}, body)
    const doc = loadPage(`
      <div id="n0" data-krantho-document="pages/pricing" data-krantho-section="Notes" style="display:contents"><p id="p0">First.</p></div>
      <div id="n1" data-krantho-document="pages/pricing" data-krantho-section="Notes" style="display:contents"><p id="p1">Second.</p></div>
    `)
    fireEvent.click(byId(doc, 'p1'))
    expect(spies.onSelect).toHaveBeenLastCalledWith(
      { kind: 'section', heading: 'Notes', index: 1 },
      false,
    )
    // Only the second section's element outlines
    expect(document.querySelectorAll('.live-outline--selected')).toHaveLength(1)
    const area = await richEditor(doc, 'Edit section Notes')
    expect(area.textContent).toBe('Second.')
    await replaceRichText(area, 'Second, changed.')
    expect(spies.draft().body).toBe('Lead.\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond, changed.\n')
    expect(byId(doc, 'n0').textContent).toBe('First.')
    expect(byId(doc, 'n1').textContent).toContain('Second, changed.')
  })

  it('Esc closes the inline editor, clears the outline, returns the panel to nothing selected and focus to the frame', async () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    expect(document.querySelector('.live-outline--selected')).not.toBeNull()
    await userEvent.setup().keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Edit field title' })).toBeNull()
    expect(document.querySelector('.live-outline--selected')).toBeNull()
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
    expect(frame()).toHaveFocus()
  })

  it('Done does the same as Esc: the page and the panel agree nothing is selected', async () => {
    const spies = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await richEditor(doc)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Done editing' }))
    expect(screen.queryByRole('textbox', { name: 'Edit section Problem' })).toBeNull()
    expect(document.querySelector('.live-outline--selected')).toBeNull()
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
  })

  it('Esc inside the frame clears the outline and returns the panel to nothing selected', () => {
    const spies = renderLive({ readOnly: true })
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    expect(document.querySelector('.live-outline--selected')).not.toBeNull()
    fireEvent.keyDown(doc.body, { key: 'Escape' })
    expect(document.querySelector('.live-outline--selected')).toBeNull()
    expect(spies.onSelect).toHaveBeenLastCalledWith(NOTHING_SELECTED, undefined)
  })

  it('the selected outline is a ring only, and its tag stays inside the layer with its full text as title', () => {
    renderLive({ readOnly: true })
    const doc = loadPage()
    byId(doc, 'title').getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 100, height: 20, x: 0, y: 0, right: 100, bottom: 20 }) as DOMRect
    fireEvent.click(byId(doc, 'title-link'))
    const outline = document.querySelector<HTMLElement>('.live-outline--selected')
    expect(outline).not.toBeNull()
    const tag = outline?.querySelector<HTMLElement>('.live-tag')
    // At the layer's top, the tag sits inside the outline rather than above it
    expect(tag?.style.top).toBe('0px')
    expect(tag).toHaveAttribute('title', 'field · title')
  })

  it('read-only: hover and select still work, the panel heading takes focus, and nothing is edited or patched', () => {
    const spies = renderLive({ readOnly: true })
    const doc = loadPage()
    fireEvent.mouseOver(byId(doc, 'title-link'))
    expect(tags()).toEqual(['field · title'])
    fireEvent.click(byId(doc, 'title-link'))
    expect(spies.onSelect).toHaveBeenLastCalledWith({ kind: 'field', name: 'title' }, true)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(byId(doc, 'title').textContent).toBe('Pricing')
  })

  it('a media field selects without an inline editor: media are not patched live', () => {
    const spies = renderLive()
    const doc = loadPage(
      '<img id="hero" data-krantho-document="pages/pricing" data-krantho-field="hero" src="/a.jpg">',
    )
    fireEvent.click(byId(doc, 'hero'))
    expect(spies.onSelect).toHaveBeenLastCalledWith({ kind: 'field', name: 'hero' }, true)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('places the inline editor again when it is resized by hand, still whole inside the stage', () => {
    const layout = stubLayout(100)
    try {
      renderLive()
      const doc = loadPage()
      fireEvent.click(byId(doc, 'title-link'))
      const editor = document.querySelector<HTMLElement>('.live-editor')
      // Under the title, which is 40px down and 20px tall
      expect(editor?.style.top).toBe('68px')
      expect(layout.observers).toHaveLength(1)
      layout.resize(560)
      // 560px tall no longer fits under it: as low as it stays whole, 600 - 8 - 560
      expect(editor?.style.top).toBe('32px')
    } finally {
      layout.restore()
    }
  })

  it('keeps the selected tag clear of an inline editor placed above the element', () => {
    const layout = stubLayout(100)
    try {
      renderLive()
      // Fifteen elements before the title put it 490px down a 600px stage
      const doc = loadPage(`${'<p>Filler</p>'.repeat(15)}${PAGE}`)
      fireEvent.click(byId(doc, 'title-link'))
      const editor = document.querySelector<HTMLElement>('.live-editor')
      // No room under it: the editor is above, 490 - 8 - 100
      expect(editor?.style.top).toBe('382px')
      const tag = document.querySelector<HTMLElement>('.live-outline--selected .live-tag')
      // Above the outline would be under the editor (470–490 against 382–482): inside its top edge
      expect(tag?.style.top).toBe('0px')
    } finally {
      layout.restore()
    }
  })
})

/**
 * A stage 800 by 600 and an inline editor 360 wide and as tall as a test
 * says, measured as a browser would; ResizeObserver reports to the test
 */
function stubLayout(height: number): {
  observers: (() => void)[]
  resize: (height: number) => void
  restore: () => void
} {
  let editorHeight = height
  const observers: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observers.push(callback)
      }
      observe(): void {}
      disconnect(): void {
        observers.length = 0
      }
    },
  )
  const sized = (element: HTMLElement, stage: number, editor: number): number => {
    if (element.classList.contains('live-stage')) return stage
    return element.classList.contains('live-editor') ? editor : 0
  }
  const stub = (
    property: 'clientWidth' | 'clientHeight' | 'offsetWidth' | 'offsetHeight' | 'scrollHeight',
    stage: number,
    editor: () => number,
  ) =>
    vi.spyOn(HTMLElement.prototype, property, 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return sized(this, stage, editor())
    })
  const spies = [
    stub('clientWidth', 800, () => 360),
    stub('offsetWidth', 800, () => 360),
    stub('clientHeight', 600, () => editorHeight),
    stub('offsetHeight', 600, () => editorHeight),
    stub('scrollHeight', 600, () => editorHeight),
  ]
  return {
    observers,
    resize: (next) => {
      editorHeight = next
      act(() => {
        for (const observer of observers) observer()
      })
    },
    restore: () => {
      for (const spy of spies) spy.mockRestore()
    },
  }
}
