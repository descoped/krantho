import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResizeHandle } from '../src/ui/resize-handle.js'

function Harness({ grows }: { grows: 'right' | 'left' }) {
  const [width, setWidth] = useState(300)
  return (
    <ResizeHandle
      label="Resize column"
      value={width}
      min={200}
      max={400}
      grows={grows}
      onChange={setWidth}
      onReset={() => setWidth(300)}
    />
  )
}

const handle = (): HTMLElement => screen.getByRole('separator', { name: 'Resize column' })

afterEach(() => {
  delete document.body.dataset.resizing
})

describe('the resize handle', () => {
  it('is a focusable separator that says its width and its bounds', () => {
    render(<Harness grows="right" />)
    expect(handle()).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle()).toHaveAttribute('aria-valuenow', '300')
    expect(handle()).toHaveAttribute('aria-valuemin', '200')
    expect(handle()).toHaveAttribute('aria-valuemax', '400')
    expect(handle()).toHaveAttribute('tabindex', '0')
  })

  it('moves the edge with the arrow keys: a column on the left grows to the right', async () => {
    const user = userEvent.setup()
    render(<Harness grows="right" />)
    handle().focus()
    await user.keyboard('{ArrowRight}')
    expect(handle()).toHaveAttribute('aria-valuenow', '316')
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(handle()).toHaveAttribute('aria-valuenow', '252')
  })

  it('grows a column on the right to the left', async () => {
    const user = userEvent.setup()
    render(<Harness grows="left" />)
    handle().focus()
    await user.keyboard('{ArrowLeft}')
    expect(handle()).toHaveAttribute('aria-valuenow', '316')
  })

  it('goes to the smallest and the largest width, and never past them', async () => {
    const user = userEvent.setup()
    render(<Harness grows="right" />)
    handle().focus()
    await user.keyboard('{End}{ArrowRight}')
    expect(handle()).toHaveAttribute('aria-valuenow', '400')
    await user.keyboard('{Home}{ArrowLeft}')
    expect(handle()).toHaveAttribute('aria-valuenow', '200')
  })

  it('follows a drag, within the bounds, and is done when the pointer is released', () => {
    render(<Harness grows="right" />)
    fireEvent.pointerDown(handle(), { button: 0, clientX: 100, pointerId: 1 })
    expect(document.body.dataset.resizing).toBe('true')
    fireEvent.pointerMove(handle(), { clientX: 150, pointerId: 1 })
    expect(handle()).toHaveAttribute('aria-valuenow', '350')
    fireEvent.pointerMove(handle(), { clientX: 900, pointerId: 1 })
    expect(handle()).toHaveAttribute('aria-valuenow', '400')
    fireEvent.pointerUp(handle(), { pointerId: 1 })
    expect(document.body.dataset.resizing).toBeUndefined()
    fireEvent.pointerMove(handle(), { clientX: 120, pointerId: 1 })
    expect(handle()).toHaveAttribute('aria-valuenow', '400')
  })

  it('goes back to the default width on a double click', async () => {
    const user = userEvent.setup()
    render(<Harness grows="right" />)
    handle().focus()
    await user.keyboard('{End}')
    await user.dblClick(handle())
    expect(handle()).toHaveAttribute('aria-valuenow', '300')
  })
})
