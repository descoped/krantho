import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMediaApi, USAGE } from './fixtures/media-api.js'
import { json, renderAt, settled } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function files(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Files' })
}

async function tile(name: RegExp): Promise<HTMLElement> {
  return within(await files()).findByRole('button', { name })
}

async function openDrawer(name: RegExp, filename: string): Promise<HTMLElement> {
  await userEvent.setup().click(await tile(name))
  return screen.findByRole('region', { name: filename })
}

describe('Media', () => {
  it('names the store in the header, with what it holds', async () => {
    installMediaApi()
    renderAt('/media')
    const header = (await screen.findByRole('heading', { level: 1, name: 'Media' })).closest(
      'header',
    ) as HTMLElement
    await waitFor(() => expect(header).toHaveTextContent('Stored in Local disk'))
    expect(header).toHaveTextContent('/srv/site/public/uploads')
    expect(header).toHaveTextContent('3 files, 6.0 KB')
  })

  it('lists folders with their counts from the API, and New folder creates one', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    await waitFor(() =>
      expect(within(folders).getByRole('button', { name: /^Logos/ })).toHaveTextContent('1'),
    )
    expect(within(folders).getByRole('button', { name: /All files/ })).toHaveTextContent('3')
    expect(within(folders).getByRole('button', { name: /^Brand/ })).toHaveTextContent('0')
    // The counts come with the library's figures: no request per folder
    const folderCounts = calls.filter((call) => call.search.includes('folder='))
    expect(folderCounts).toHaveLength(0)

    const user = userEvent.setup()
    await user.click(within(folders).getByRole('button', { name: 'New folder' }))
    await user.type(within(folders).getByRole('textbox', { name: 'New folder' }), 'Team{Enter}')
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'POST /api/media/folders')?.body).toEqual({
        name: 'Team',
        parentId: null,
      }),
    )
  })

  it('shows each tile with its thumbnail, kind, name, dimensions and reference count', async () => {
    const calls = installMediaApi({
      usage: { ...USAGE, fjord: [{ collection: 'pages', slug: 'about', field: 'hero' }] },
    })
    renderAt('/media')
    const fjord = await tile(/fjord\.jpg/)
    expect(fjord.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringMatching(/^\/api\/media\/fjord\/image\?preset=md/),
    )
    expect(fjord).toHaveTextContent('JPEG')
    expect(fjord).toHaveTextContent('1200 × 630')
    await waitFor(() => expect(fjord).toHaveTextContent('Referenced by 1 document'))
    const plan = await tile(/plan\.svg/)
    expect(plan).toHaveTextContent('SVG')
    expect(plan).toHaveTextContent('No pixel dimensions')
    // The page's files are read together, in one request
    expect(calls.filter((call) => call.key === 'GET /api/media/usage')).toHaveLength(1)
  })

  it('says on every tile when the page’s references could not be read', async () => {
    installMediaApi({ usage: { fjord: USAGE.fjord ?? [] } })
    renderAt('/media')
    const plan = await tile(/plan\.svg/)
    // plan's usage is not in the fake, so the read fails: no number, and why
    await waitFor(() => expect(plan).toHaveTextContent('References could not be read'))
    expect(await tile(/fjord\.jpg/)).toHaveTextContent('References could not be read')
  })

  it('searches by name through the API', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    await files()
    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search media' }), 'logo')
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem'),
      ).toHaveLength(1),
    )
    expect(
      calls.some((call) => call.key === 'GET /api/media' && call.search.includes('search=logo')),
    ).toBe(true)
  })

  it('uploads chosen files, announcing the progress and each failure', async () => {
    const calls = installMediaApi({
      routes: {
        'POST /api/media/upload': () => json({ error: 'Unsupported file type: text/plain' }, 400),
      },
    })
    renderAt('/media')
    const upload = await screen.findByRole('region', { name: 'Upload' })
    const input = upload.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }))
    await settled()
    expect(within(upload).getByRole('alert')).toHaveTextContent(
      'notes.txt: Unsupported file type: text/plain',
    )
    expect(within(upload).getByRole('status')).toHaveTextContent('Uploaded 0 files.')
    expect(calls.filter((call) => call.key === 'POST /api/media/upload')).toHaveLength(1)
  })

  it('bulk-selects files and deletes them once confirmed, warning about references', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    await files()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bulk select' }))
    await settled()
    expect(
      screen.getByRole('checkbox', { name: 'Select fjord.jpg' }).closest('label'),
    ).toHaveTextContent('Referenced by 2 documents')
    await user.click(screen.getByRole('checkbox', { name: 'Select fjord.jpg' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select logo.png' }))
    const bar = screen.getByRole('region', { name: 'Selection' })
    expect(bar).toHaveTextContent('2 selected')
    await user.click(within(bar).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete files' })
    await settled()
    expect(dialog).toHaveTextContent('fjord.jpg — Referenced by 2 documents')
    expect(dialog).toHaveTextContent('logo.png — Not referenced')
    expect(dialog).toHaveTextContent('1 file is used by documents')
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 files' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Deleted 2 files.')
    expect(calls.find((call) => call.key === 'DELETE /api/media/bulk')?.body).toEqual({
      ids: ['fjord', 'logo'],
    })
  })

  it('keeps bulk Delete from an editor, saying it needs an admin', async () => {
    installMediaApi({ role: 'editor' })
    renderAt('/media')
    await files()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Bulk select' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Select logo.png' }))
    const remove = within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', {
      name: 'Delete',
    })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAccessibleDescription(/needs the admin role/)
  })
})

describe('Media details drawer', () => {
  it('shows the preview, dimensions, size, stable URL and the documents that use it', async () => {
    installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    expect(within(drawer).getByRole('heading', { name: 'fjord.jpg' })).toHaveFocus()
    expect(within(drawer).getByRole('img', { name: 'A fjord at dawn' })).toBeInTheDocument()
    expect(drawer).toHaveTextContent('1200 × 630')
    expect(drawer).toHaveTextContent('2.0 KB')
    expect(drawer).toHaveTextContent('/api/media/fjord/image?preset=xl')
    await waitFor(() => expect(drawer).toHaveTextContent('Referenced by 2 documents'))
    expect(within(drawer).getByRole('link', { name: 'pages/about' })).toHaveAttribute(
      'href',
      '/site/pages/about',
    )
    expect(within(drawer).getByRole('link', { name: 'Crop & hotspot' })).toHaveAttribute(
      'href',
      '/media/fjord/edit',
    )
  })

  it('warns before renaming a file documents use, saying only the name changes', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    await waitFor(() => expect(drawer).toHaveTextContent('Referenced by 2 documents'))
    const user = userEvent.setup()
    const name = within(drawer).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'fjord-dawn.jpg')
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename a file in use' })
    expect(dialog).toHaveTextContent('2 documents use this file')
    expect(dialog).toHaveTextContent(
      'the file and its URL stay the same, so their pages keep the same image',
    )
    expect(calls.some((call) => call.key === 'PUT /api/media/fjord')).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PUT /api/media/fjord')?.body).toEqual({
        altText: 'A fjord at dawn',
        tags: ['landscape'],
        filename: 'fjord-dawn.jpg',
      }),
    )
  })

  it('saves the alt text on the file without a warning when the name is unchanged', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    const user = userEvent.setup()
    const alt = within(drawer).getByRole('textbox', { name: 'Alt text' })
    await user.clear(alt)
    await user.type(alt, 'Morning over the fjord')
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PUT /api/media/fjord')?.body).toEqual({
        altText: 'Morning over the fjord',
        tags: ['landscape'],
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('replaces the file keeping its id, and says so', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    const input = drawer.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, new File(['x'], 'new.jpg', { type: 'image/jpeg' }))
    await settled()
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      'it keeps its id, so pages that use it show the new file. 1 document that held its old URL now holds the new one.',
    )
    expect(calls.some((call) => call.key === 'POST /api/media/fjord/replace')).toBe(true)
  })

  it('copies the markdown with the stable URL, and says when the clipboard refuses', async () => {
    installMediaApi()
    renderAt('/media')
    const user = userEvent.setup()
    await user.click(await tile(/fjord\.jpg/))
    const drawer = await screen.findByRole('region', { name: 'fjord.jpg' })
    await user.click(within(drawer).getByRole('button', { name: 'Copy markdown' }))
    const markdown = '![A fjord at dawn](/api/media/fjord/image?preset=xl)'
    expect(await navigator.clipboard.readText()).toBe(markdown)
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      `Markdown copied: ${markdown}`,
    )
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(within(drawer).getByRole('button', { name: 'Copy markdown' }))
    expect(await screen.findByRole('alert', { name: 'Errors' })).toHaveTextContent(
      `Could not copy. Copy it yourself: ${markdown}`,
    )
  })

  it('duplicates the file and opens the copy', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    await userEvent.setup().click(within(drawer).getByRole('button', { name: 'Duplicate' }))
    await settled()
    expect(calls.some((call) => call.key === 'POST /api/media/logo/duplicate')).toBe(true)
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      'Duplicated as logo.png, with a new id.',
    )
  })

  it('deletes the open file once confirmed, closing its drawer', async () => {
    const calls = installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/fjord\.jpg/, 'fjord.jpg')
    await settled()
    expect(drawer).toHaveTextContent('Referenced by 2 documents')
    const user = userEvent.setup()
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete file' })
    await settled()
    expect(dialog).toHaveTextContent('Their pages lose the image')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete 1 file' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Deleted 1 file.')
    expect(calls.some((call) => call.key === 'DELETE /api/media/fjord')).toBe(true)
    expect(drawer).not.toBeInTheDocument()
  })

  it('closes on Esc and returns focus to the tile', async () => {
    installMediaApi()
    renderAt('/media')
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    await userEvent.setup().keyboard('{Escape}')
    expect(drawer).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /logo\.png/ })).toHaveFocus())
  })

  it('keeps every change from a viewer, saying why', async () => {
    installMediaApi({ role: 'viewer' })
    renderAt('/media')
    const drawer = await openDrawer(/logo\.png/, 'logo.png')
    for (const name of ['Replace', 'Duplicate', 'Delete', 'Save', 'Crop & hotspot']) {
      const button = within(drawer).getByRole('button', { name })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('Your role can view media but not change it.')
    }
    expect(within(drawer).getByRole('textbox', { name: 'Alt text' })).toBeDisabled()
    const upload = screen.getByRole('region', { name: 'Upload' })
    expect(within(upload).getByRole('button', { name: 'Choose files' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
