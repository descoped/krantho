import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMediaApi, mediaFile } from './fixtures/media-api.js'
import { renderAt, settled } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const CROPPED = mediaFile('fjord', {
  altText: 'A fjord at dawn',
  crop: { x: 10, y: 10, width: 50, height: 40 },
})

describe('image editor', () => {
  it('places the hotspot from the keyboard and saves it with the crop', async () => {
    const calls = installMediaApi({ files: [CROPPED] })
    renderAt('/media/fjord/edit')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Crop & hotspot · fjord.jpg' }),
    ).toBeInTheDocument()
    const user = userEvent.setup()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: 'Hotspot' }))
    expect(screen.getByRole('button', { name: 'Hotspot' })).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: /Place the hotspot/ }).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByText(/Hotspot at 52%, 50%/)).toBeInTheDocument()
    await user.click(save)
    await settled()
    expect(calls.find((call) => call.key === 'PUT /api/media/fjord')?.body).toEqual({
      crop: { x: 10, y: 10, width: 50, height: 40 },
      hotspot: { x: 52, y: 50, width: 15, height: 15 },
    })
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent(
      'Crop and hotspot saved.',
    )
  })

  it('resets to the original framing', async () => {
    const calls = installMediaApi({ files: [CROPPED] })
    renderAt('/media/fjord/edit')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reset' }))
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PUT /api/media/fjord')?.body).toEqual({
        crop: null,
        hotspot: null,
      }),
    )
  })

  it('asks before leaving with unsaved changes', async () => {
    installMediaApi({ files: [CROPPED] })
    renderAt('/media/fjord/edit')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Hotspot' }))
    await user.click(screen.getByRole('button', { name: /Place the hotspot/ }))
    await user.click(screen.getByRole('button', { name: 'Back to Media' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes' })
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  })

  it('says when the file cannot be read', async () => {
    installMediaApi({ files: [] })
    renderAt('/media/missing/edit')
    // The fake answers an unknown id as the API does: 404 with its error
    expect(await screen.findByText('not found')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('link', { name: 'Back to Media' })).toHaveAttribute('href', '/media')
  })

  it('is read-only for a viewer: nothing can be drawn, and Save and Reset say why', async () => {
    const calls = installMediaApi({ files: [CROPPED], role: 'viewer' })
    renderAt('/media/fjord/edit')
    const reset = await screen.findByRole('button', { name: 'Reset' })
    const save = screen.getByRole('button', { name: 'Save' })
    for (const button of [reset, save]) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('Your role can view media but not change it.')
    }
    expect(screen.getByRole('note')).toHaveTextContent(
      'Your role can view media but not change it.',
    )
    const user = userEvent.setup()
    await user.click(reset)
    await user.click(save)
    await user.click(screen.getByRole('button', { name: 'Hotspot' }))
    expect(screen.getByRole('button', { name: /Place the hotspot/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Crop' }))
    expect(document.querySelector('.ReactCrop--disabled')).not.toBeNull()
    expect(calls.some((call) => call.key === 'PUT /api/media/fjord')).toBe(false)
  })
})
