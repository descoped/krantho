import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, openEditor, WARM_TIMEOUT_MS, warmEditor } from './fixtures/editor-api.js'
import { card, panel, pricing, seoRoutes } from './fixtures/side-panel.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

const KEY = 'krantho-studio-panel'
let storage: Storage

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const columns = (): HTMLElement => document.querySelector('.editor-columns') as HTMLElement

describe('the side panel, collapsed and resized', () => {
  it('hides, and leaves the canvas the whole width, with a button to show it again', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const user = userEvent.setup()
    await card('Page & sections')
    await user.click(screen.getByRole('button', { name: 'Hide side panel' }))
    expect(screen.queryByRole('complementary', { name: 'Side panel' })).toBeNull()
    expect(columns()).toHaveClass('editor-columns--collapsed')
    const show = screen.getByRole('button', { name: 'Show side panel' })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(show).toHaveFocus())
    await user.click(show)
    expect(await panel()).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Hide side panel' })).toHaveFocus(),
    )
  })

  it('remembers that it was hidden, in this browser', async () => {
    storage.setItem(KEY, JSON.stringify({ collapsed: true, width: 380 }))
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    expect(await screen.findByRole('button', { name: 'Show side panel' })).toBeVisible()
    expect(screen.queryByRole('complementary', { name: 'Side panel' })).toBeNull()
  })

  it('is resized with its handle, and keeps the width', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    const user = userEvent.setup()
    const side = await panel()
    const handle = within(side.parentElement as HTMLElement).getByRole('separator', {
      name: 'Resize side panel',
    })
    expect(columns().style.getPropertyValue('--panel-width')).toBe('380px')
    handle.focus()
    // The panel is on the right: the edge moving left makes it wider
    await user.keyboard('{ArrowLeft}')
    expect(handle).toHaveAttribute('aria-valuenow', '396')
    expect(columns().style.getPropertyValue('--panel-width')).toBe('396px')
    expect(JSON.parse(storage.getItem(KEY) ?? '{}')).toEqual({ collapsed: false, width: 396 })
  })

  it('writes nothing to the browser until the viewer changes the layout', async () => {
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('starts at a remembered width, and ignores one outside the bounds', async () => {
    storage.setItem(KEY, JSON.stringify({ collapsed: false, width: 9000 }))
    openEditor({ doc: pricing() }, { routes: seoRoutes() })
    await panel()
    expect(columns().style.getPropertyValue('--panel-width')).toBe('380px')
  })
})
