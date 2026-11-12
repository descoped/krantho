import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  byId,
  liveModeHooks,
  loadPage,
  renderLive,
  richEditor,
  selectRich,
} from './fixtures/live-mode.js'

liveModeHooks()
const BODY =
  'Lead.\n\n## Problem\n\nBefore.\n\n| Name | Count |\n| --- | ---: |\n| One | 1 |\n| Two | 2 |\n\nAfter.\n\n## Notes\n\nUntouched.'

async function openTable(body = BODY) {
  const live = renderLive({}, body)
  const doc = loadPage()
  fireEvent.click(byId(doc, 'problem-p'))
  const editor = await richEditor(doc)
  return { live, doc, editor }
}

function action(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('Contextual table controls', () => {
  it('appears only inside a table and follows the row, column and alignment without changing Markdown', async () => {
    const { live, editor } = await openTable()
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull()
    await selectRich(editor, 'tr:nth-child(2) td:nth-child(2) p')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    const panel = screen.getByRole('group', { name: 'Table actions' })
    expect(panel).toHaveTextContent('Row 2')
    expect(panel).toHaveTextContent('Column 2')
    expect(screen.getByRole('button', { name: 'Align column right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Table actions' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Table' })).toHaveFocus()
    expect(editor.isConnected).toBe(true)
    expect(live.draft().body).toBe(BODY)
  })

  it('adds rows and columns, preserves header/content and applies alignment to the whole column', async () => {
    const { live, editor } = await openTable()
    await selectRich(editor, 'tr:nth-child(2) td:nth-child(2) p')
    action('Insert row below')
    expect(editor.querySelectorAll('tr')).toHaveLength(4)
    expect(editor.querySelector('th')?.textContent).toBe('Name')
    expect(editor.textContent).toContain('Two')
    await selectRich(editor, 'tr:nth-child(2) td:nth-child(2) p')
    action('Insert column left')
    expect(editor.querySelectorAll('th')).toHaveLength(3)
    expect(editor.querySelectorAll('td')).toHaveLength(9)
    await selectRich(editor, 'tr:nth-child(2) td:nth-child(3) p')
    action('Align column center')
    for (const cell of editor.querySelectorAll<HTMLTableCellElement>('tr > :nth-child(3)')) {
      expect(cell.style.textAlign).toBe('center')
    }
    expect(live.draft().body).toMatch(/:---+:/)
    expect(live.draft().body).toContain('## Notes\n\nUntouched.')
    expect(live.draft().body).toContain('Before.')
    expect(live.draft().body).toContain('After.')
  })

  it('protects the Markdown header, last body row and last column', async () => {
    const { editor } = await openTable('## Problem\n\n| Name |\n| --- |\n| One |')
    await selectRich(editor, 'th p')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Insert row above' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete column' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    await selectRich(editor, 'td p')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeDisabled()
  })

  it('deletes a row, a column and the table, and Undo restores the table', async () => {
    const { live, editor } = await openTable()
    await selectRich(editor, 'tr:nth-child(2) td p')
    action('Delete row')
    expect(editor.querySelectorAll('tr')).toHaveLength(2)
    expect(editor.textContent).not.toContain('One')
    await selectRich(editor, 'td:nth-child(2) p')
    action('Delete column')
    expect(editor.querySelectorAll('th')).toHaveLength(1)
    expect(editor.querySelector('th')?.textContent).toBe('Name')
    await selectRich(editor, 'td p')
    action('Delete table')
    expect(editor.querySelector('table')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull()
    expect(live.draft().body).toContain('After.')
    expect(live.draft().body).toContain('## Notes\n\nUntouched.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(editor.querySelector('table')).not.toBeNull()
  })
})
