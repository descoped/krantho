import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFERENCE_WAIT_MS } from '../src/media/use-rename-gate.js'
import { installMediaApi, mediaFile, USAGE } from './fixtures/media-api.js'
import { json, renderAt, settled } from './fixtures/site-api.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function openDrawer(name: RegExp, filename: string): Promise<HTMLElement> {
  const files = await screen.findByRole('list', { name: 'Files' })
  await userEvent.setup().click(await within(files).findByRole('button', { name }))
  return screen.findByRole('region', { name: filename })
}

async function rename(
  drawer: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const name = within(drawer).getByRole('textbox', { name: 'Name' })
  await user.clear(name)
  await user.type(name, 'fjord-dawn.jpg')
  await user.click(within(drawer).getByRole('button', { name: 'Save' }))
}

/** A usage answer the test releases when it chooses */
/** The page's one read of its files' references, answered once released */
function heldUsage(): { route: () => Promise<Response>; release: () => void } {
  let release = (): void => undefined
  const answer = new Promise<Response>((resolve) => {
    release = () => resolve(json({ usage: USAGE }))
  })
  return { route: () => answer, release: () => release() }
}

describe('Media details drawer, what the old screens had', () => {
  it('copies the ID, announced, and says when the clipboard refuses', async () => {
    installMediaApi()
    renderAt('/media')
    const user = userEvent.setup()
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    await user.click(within(drawer).getByRole('button', { name: 'Copy ID' }))
    expect(await navigator.clipboard.readText()).toBe('logo')
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      'ID copied: logo',
    )
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(within(drawer).getByRole('button', { name: 'Copy ID' }))
    expect(await screen.findByRole('alert', { name: 'Errors' })).toHaveTextContent(
      'Could not copy. Copy it yourself: logo',
    )
  })

  it('opens the stored original in a new tab, and shows when the file was uploaded', async () => {
    installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    const original = within(drawer).getByRole('link', { name: /^Open original/ })
    expect(original).toHaveTextContent('Open original (opens in a new tab)')
    expect(original).toHaveAttribute('href', '/uploads/1-logo.jpg')
    expect(original).toHaveAttribute('target', '_blank')
    expect(original).toHaveAttribute('rel', 'noopener noreferrer')
    const uploaded = drawer.querySelector('time')
    expect(uploaded).toHaveAttribute('dateTime', '2026-09-30T10:00:00.000Z')
    expect(uploaded?.textContent).toMatch(/2026/)
  })

  it('collapses and expands a folder’s subfolders from the keyboard', async () => {
    installMediaApi()
    renderAt('/media')
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    const toggle = await within(folders).findByRole('button', { name: 'Subfolders of Brand' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(folders).getByRole('button', { name: /Logos/ })).toBeInTheDocument()
    toggle.focus()
    const user = userEvent.setup()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(folders).queryByRole('button', { name: /Logos/ })).toBeNull()
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(folders).getByRole('button', { name: /Logos/ })).toBeInTheDocument()
    expect(within(folders).queryByRole('button', { name: 'Subfolders of Logos' })).toBeNull()
  })
})

describe('Media rename while the references are still read', () => {
  it('waits for them, then warns with the count', async () => {
    const usage = heldUsage()
    const calls = installMediaApi({ routes: { 'GET /api/media/usage': usage.route } })
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    const user = userEvent.setup()
    await rename(drawer, user)
    const save = within(drawer).getByRole('button', { name: 'Checking references…' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(calls.some((call) => call.key === 'PUT /api/media/fjord')).toBe(false)
    usage.release()
    const dialog = await screen.findByRole('dialog', { name: 'Rename a file in use' })
    expect(dialog).toHaveTextContent('2 documents use this file')
    expect(calls.some((call) => call.key === 'PUT /api/media/fjord')).toBe(false)
  })

  it('warns without a count when they do not arrive in time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    const calls = installMediaApi({
      routes: { 'GET /api/media/usage': () => new Promise(() => undefined) },
    })
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    await rename(drawer, userEvent.setup({ advanceTimers: vi.advanceTimersByTime }))
    expect(within(drawer).getByRole('button', { name: 'Checking references…' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFERENCE_WAIT_MS)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Rename a file in use' })
    expect(dialog).toHaveTextContent(
      "This file's references are not known, so documents may use it.",
    )
    expect(calls.some((call) => call.key === 'PUT /api/media/fjord')).toBe(false)
  })

  it('saves at once when they show no document uses the file', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    await waitFor(() => expect(drawer).toHaveTextContent('Not referenced'))
    const user = userEvent.setup()
    const name = within(drawer).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'mark.png')
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PUT /api/media/logo')?.body).toMatchObject({
        filename: 'mark.png',
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Media uploads', () => {
  it('refuses a drop from a role that cannot upload, without highlighting the zone', async () => {
    const calls = installMediaApi({ role: 'viewer' })
    renderAt('/media')
    const zone = await screen.findByRole('region', { name: 'Upload' })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const dataTransfer = { types: ['Files'], files: [file] }
    fireEvent.dragOver(zone, { dataTransfer })
    expect(zone).not.toHaveClass('media-drop--over')
    fireEvent.drop(zone, { dataTransfer })
    expect(within(zone).getByRole('status')).toHaveTextContent('Your role cannot upload files.')
    expect(calls.some((call) => call.key === 'POST /api/media/upload')).toBe(false)
  })

  it('says an upload in a folder view went to All files, and Move here moves it', async () => {
    const calls = installMediaApi({
      routes: {
        'PUT /api/media/upload/move': () => json(mediaFile('upload', { folder: 'f-logos' })),
      },
    })
    renderAt('/media')
    const user = userEvent.setup()
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    await user.click(await within(folders).findByRole('button', { name: /Logos/ }))
    const zone = screen.getByRole('region', { name: 'Upload' })
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'shot.png', { type: 'image/png' }))
    const notice = await screen.findByText(/^Uploaded 1 file to All files/)
    expect(notice).toHaveTextContent('Move it to Logos from its details, or with Move here.')
    await user.click(screen.getByRole('button', { name: 'Move here' }))
    await settled()
    expect(calls.find((call) => call.key === 'PUT /api/media/upload/move')?.body).toEqual({
      folderId: 'f-logos',
    })
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      'Moved 1 file to Logos.',
    )
    expect(screen.queryByRole('button', { name: 'Move here' })).toBeNull()
  })
})
