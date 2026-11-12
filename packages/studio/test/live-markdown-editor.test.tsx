import { Editor } from '@milkdown/core'
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { byId, liveModeHooks, loadPage, renderLive, richEditor } from './fixtures/live-mode.js'

liveModeHooks()

describe('The contextual Markdown toolbar', () => {
  it('formats selected text, supports undo and keeps neighbouring sections intact', async () => {
    const live = renderLive()
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    const editor = await richEditor(doc)
    const text = editor.querySelector('p')?.firstChild
    if (!text) throw new Error('missing paragraph')
    await act(async () => {
      const range = doc.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 4)
      doc.getSelection()?.removeAllRanges()
      doc.getSelection()?.addRange(range)
      doc.dispatchEvent(new Event('selectionchange'))
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    expect(live.draft().body).toContain('**What** hurts.')
    expect(live.draft().body).toContain('## Notes\n\nMore.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(live.draft().body).toContain('What hurts.')
    expect(live.draft().body).not.toContain('**What**')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }))
    expect(screen.getByRole('button', { name: 'Strikethrough' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(live.draft().body).toContain('~~What~~ hurts.')
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }))
    expect(screen.getByRole('button', { name: 'Strikethrough' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(live.draft().body).toContain('What hurts.')
  })

  it('reports initialization failures and preserves both the Markdown and original page markup', async () => {
    const editor = Editor.make()
    const make = vi.spyOn(Editor, 'make').mockReturnValueOnce(editor)
    const create = vi.spyOn(editor, 'create').mockRejectedValueOnce(new Error('Editor failed'))
    try {
      const live = renderLive()
      const doc = loadPage()
      const section = byId(doc, 'problem')
      const original = section.innerHTML
      const body = live.draft().body
      fireEvent.click(byId(doc, 'problem-p'))
      expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened visually')
      expect(live.draft().body).toBe(body)
      expect(section.innerHTML).toBe(original)
      fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
      expect(section.innerHTML).toBe(original)
    } finally {
      create.mockRestore()
      make.mockRestore()
    }
  })
})
