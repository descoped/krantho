import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SourceChip } from '../src/editor/data-mode/scope-chip.js'

describe('SourceChip', () => {
  it('names the scope and its meaning in one phrase, with no space before the colon', () => {
    render(<SourceChip scope="site" />)
    const hidden = document.querySelector('.visually-hidden')
    expect(hidden?.textContent).toMatch(/^[^\s:]+: \S/)
    // The visible label is not read twice
    expect(screen.getAllByText(hidden?.textContent?.split(':')[0] ?? '')[0]).toBeDefined()
    expect(document.querySelector('[aria-hidden="true"]:not(svg)')).not.toBeNull()
  })
})
