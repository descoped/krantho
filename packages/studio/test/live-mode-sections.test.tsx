import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  byId,
  liveModeHooks,
  loadPage,
  renderLive,
  replaceRichText,
  richEditor,
} from './fixtures/live-mode.js'

liveModeHooks()

describe('Visual Markdown editing in the page', () => {
  it('opens formatted content in the page and exits without changing untouched Markdown', async () => {
    const body =
      'Lead.\n\n## Problem\n\nText with __bold__ and a [link](https://example.com).\n\n| A | B |\n| --- | --- |\n| one | two |\n\n## Notes\n\nMore.'
    const live = renderLive({}, body)
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    const editor = await richEditor(doc)
    expect(editor.querySelector('strong')?.textContent).toBe('bold')
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(editor.querySelector('table')).not.toBeNull()
    expect(editor.closest('[data-krantho-section]')).toBe(byId(doc, 'problem'))
    expect(screen.queryByRole('textbox', { name: 'Edit section Problem' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
    expect(doc.querySelector('.ProseMirror')).toBeNull()
    expect(live.draft().body).toBe(body)
  })

  it('writes only the opened section and immediately keeps the edit on click-out', async () => {
    const live = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'Updated section.')
    fireEvent.click(byId(doc, 'description'))
    expect(doc.querySelector('.ProseMirror')).toBeNull()
    expect(live.draft().body).toBe(
      'Lead words.\n\n## Problem\n\nUpdated section.\n\n## Notes\n\nMore.',
    )
    expect(byId(doc, 'problem').querySelector('h2')).toHaveTextContent('Problem')
    expect(byId(doc, 'problem')).toHaveTextContent('Updated section.')
  })

  it('cancel restores this section without reverting another field edit', async () => {
    const live = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'title-link'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit field title' }), {
      target: { value: 'New title' },
    })
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'Changed.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel this element’s edit' }))
    expect(live.draft().body).toContain('What hurts.')
    expect(live.draft().body).not.toContain('Changed.')
    expect(live.draft().fields.title).toBe('New title')
    expect(byId(doc, 'problem')).toHaveTextContent('What hurts.')
  })

  it('outside body changes close the editor and cannot be overwritten', async () => {
    const live = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'Typed.')
    const restored = 'Lead.\n\n## Problem\n\nRestored.\n\n## Notes\n\nDifferent.'
    live.replaceBody(restored)
    expect(doc.querySelector('.ProseMirror')).toBeNull()
    expect(live.draft().body).toBe(restored)
    expect(screen.getByText('The section changed elsewhere; open it again to edit.')).toBeVisible()
  })

  it('patches repeated renderings while editing and preserves their template headings', async () => {
    const live = renderLive()
    const doc = loadPage(
      '<div id="hero" data-krantho-document="pages/pricing" data-krantho-section="Problem"><p>What hurts.</p></div><article><div id="problem" data-krantho-document="pages/pricing" data-krantho-section="Problem" style="display:contents"><h2>Problem</h2><p id="problem-p">What hurts.</p></div></article>',
    )
    fireEvent.click(byId(doc, 'problem-p'))
    await replaceRichText(await richEditor(doc), 'Repeated edit.')
    expect(byId(doc, 'problem')).toHaveTextContent('Repeated edit.')
    expect(byId(doc, 'hero')).toHaveTextContent('Repeated edit.')
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
    expect(byId(doc, 'problem').querySelector('h2')).toHaveTextContent('Problem')
    expect(live.draft().body).toContain('Repeated edit.')
  })

  it('lists and inserts missing designed sections without changing existing sections', async () => {
    const live = renderLive()
    loadPage()
    const missing = screen.getByRole('list', { name: 'Designed sections not written' })
    expect(missing).toHaveTextContent('In the page: after Problem.')
    await userEvent
      .setup()
      .click(within(missing).getByRole('button', { name: 'Add section Approach' }))
    expect(live.draft().body).toContain('## Approach')
    expect(live.draft().body).toContain('## Notes\n\nMore.')
  })
})
