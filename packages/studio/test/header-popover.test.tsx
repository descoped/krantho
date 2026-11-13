import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampShift, HeaderPopover } from '../src/editor/header-popover.js'

describe('header popover', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves a panel inward so it keeps 16px from each edge', () => {
    expect(clampShift(40, 300, 390)).toBe(0)
    expect(clampShift(-40, 280, 390)).toBe(56)
    expect(clampShift(100, 420, 390)).toBe(-46)
    // Wider than the room: its start edge wins
    expect(clampShift(10, 400, 390)).toBe(6)
  })

  it('opens on-screen at a phone’s width, anchored to its chip', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const panel = this.classList.contains('editor-popover-panel')
      return DOMRect.fromRect(panel ? { x: -40, width: 320 } : { x: 0, width: 0 })
    })
    render(
      <HeaderPopover label="Live" tone="success">
        <p>Detail</p>
      </HeaderPopover>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Live' }))
    const panel = screen.getByText('Detail').parentElement as HTMLElement
    expect(panel).toBeVisible()
    // 56px to the right; the vertical 0 may be left out when the style is read back
    expect(panel.style.translate).toMatch(/^56px( 0(px)?)?$/)
  })
})
