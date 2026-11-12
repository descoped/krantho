import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from '../src/ui/toast.js'

/** The provider's `toast`, for raising one while focus stays where the test put it */
let raise: ReturnType<typeof useToast> = () => undefined

function Raise(): ReactElement {
  const toast = useToast()
  raise = toast
  return (
    <main id="studio-main" tabIndex={-1}>
      <button type="button" onClick={() => toast({ text: 'Draft saved' })}>
        Save
      </button>
      <button type="button" onClick={() => toast({ text: 'Save failed', tone: 'error' })}>
        Fail
      </button>
    </main>
  )
}

function renderToasts(): void {
  render(
    <ToastProvider>
      <Raise />
    </ToastProvider>,
  )
}

describe('toasts', () => {
  it('announces a success politely and an error at once', async () => {
    renderToasts()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent('Draft saved')
    const errors = screen.getByRole('alert', { name: 'Errors' })
    expect(errors).toHaveTextContent('Save failed')
    expect(errors).not.toHaveTextContent('Draft saved')
  })

  it('moves focus to the next toast when one is dismissed, then to the page', async () => {
    renderToasts()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fail' }))
    await user.click(screen.getByRole('button', { name: 'Fail' }))
    const errors = screen.getByRole('alert', { name: 'Errors' })
    const [first, second] = within(errors).getAllByRole('button', { name: 'Dismiss' })
    first?.focus()
    await user.keyboard('{Enter}')
    expect(second).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('marks an error with an icon, not colour alone, and Esc dismisses it while focused', async () => {
    renderToasts()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fail' }))
    const errors = screen.getByRole('alert', { name: 'Errors' })
    expect(errors.querySelector('.ui-toast-icon')).not.toBeNull()
    within(errors).getByRole('button', { name: 'Dismiss' }).focus()
    await user.keyboard('{Escape}')
    expect(errors).toBeEmptyDOMElement()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('moves focus on when a newer toast pushes out the one that held it', async () => {
    renderToasts()
    const user = userEvent.setup()
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Fail' }))
    const errors = screen.getByRole('alert', { name: 'Errors' })
    const oldest = within(errors).getAllByRole('button', { name: 'Dismiss' })[0] as HTMLElement
    oldest.focus()
    // A fourth goes over the cap: the oldest, which holds focus, goes
    act(() => raise({ text: 'Another failure', tone: 'error' }))
    expect(oldest).not.toBeInTheDocument()
    await waitFor(() =>
      expect(within(errors).getAllByRole('button', { name: 'Dismiss' })[0]).toHaveFocus(),
    )
  })
})
