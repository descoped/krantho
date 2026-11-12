import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { byId, liveModeHooks, loadPage, renderLive, richEditor } from './fixtures/live-mode.js'

liveModeHooks()

describe('Markdown selection formatting', () => {
  it('follows caret and selection formatting, including mixed selections, without changing the draft', async () => {
    const body =
      'Lead.\n\n## Problem\n\n**Bold** plain.\n\n### *Italic heading*\n\n> Quote\n\n- Item\n\n## Notes\n\nMore.'
    const live = renderLive({}, body)
    const doc = loadPage()
    fireEvent.click(byId(doc, 'problem-p'))
    const editor = await richEditor(doc)
    const select = async (selector: string, all = false): Promise<void> => {
      const node = editor.querySelector(selector)
      if (!node) throw new Error('missing text')
      await act(async () => {
        const range = doc.createRange()
        range.selectNodeContents(node)
        if (!all) range.collapse(true)
        doc.getSelection()?.removeAllRanges()
        doc.getSelection()?.addRange(range)
        doc.dispatchEvent(new Event('selectionchange'))
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
    }
    await select('strong')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await select('p', true)
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'mixed')
    await select('h3 em')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Text style' })).toHaveValue('3')
    await select('blockquote p')
    expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Text style' })).toHaveValue('0')
    await select('li p')
    expect(screen.getByRole('button', { name: 'Bullet list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute('aria-pressed', 'false')
    expect(live.draft().body).toBe(body)
  })
})
