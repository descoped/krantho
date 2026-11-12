import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { versionRoutes } from './fixtures/data-api.js'
import {
  aheadDoc,
  header,
  memoryStorage,
  openEditor,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { json, settled } from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => vi.unstubAllGlobals())
const versions = [
  { version: 3, title: 'Pricing' },
  { version: 2, title: 'Prices' },
]

function open(role: 'admin' | 'viewer' = 'admin'): ReturnType<typeof openEditor> {
  return openEditor({ doc: aheadDoc() }, { role, routes: versionRoutes(() => versions) })
}

describe('Article snapshot timeline', () => {
  it('navigates chronologically with slider keys and older/newer controls, and collapses to a summary', async () => {
    open()
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    const slider = await within(timeline).findByRole('slider', { name: 'Snapshot selection' })
    expect(slider).toHaveValue('1')
    const user = userEvent.setup()
    await user.click(within(timeline).getByRole('button', { name: 'Older snapshot' }))
    expect(slider).toHaveValue('0')
    expect(within(timeline).getByRole('button', { name: 'Select snapshot v2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(timeline).getByRole('button', { name: 'Newer snapshot' }))
    expect(slider).toHaveValue('1')
    await user.click(within(timeline).getByRole('button', { name: 'Collapse snapshot timeline' }))
    expect(within(timeline).queryByRole('slider')).toBeNull()
    expect(within(timeline).getByRole('button', { name: 'Snapshot details' })).toBeVisible()
    await user.click(within(timeline).getByRole('button', { name: 'Expand snapshot timeline' }))
    expect(within(timeline).getByRole('slider')).toHaveValue('1')
  })

  it('marks current and live snapshots, previews an older version without changing the form, and returns focus', async () => {
    const calls = open()
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    const current = await within(timeline).findByRole('button', { name: 'Select snapshot v3' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(current).toHaveTextContent('Current')
    const older = within(timeline).getByRole('button', { name: 'Select snapshot v2' })
    expect(older).toHaveTextContent('Live')
    const user = userEvent.setup()
    await user.click(older)
    await user.click(within(timeline).getByRole('button', { name: 'Snapshot details' }))
    const preview = within(timeline).getByRole('button', { name: 'Preview snapshot' })
    await user.click(preview)
    const dialog = await screen.findByRole('dialog', { name: 'Snapshot v2' })
    expect(await within(dialog).findByText('Body of v2')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Pricing')
    expect(calls.find((c) => c.key === 'GET /api/content/pages/pricing/versions/2')?.search).toBe(
      '?locale=en',
    )
    expect(calls.some((c) => c.key.startsWith('POST /api/content/pages/pricing/restore'))).toBe(
      false,
    )
    await user.keyboard('{Escape}')
    expect(preview).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps unsaved work visible and requires restore confirmation', async () => {
    const calls = open()
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    const user = userEvent.setup()
    await settled()
    await user.type(screen.getByRole('textbox', { name: 'title' }), ' edited')
    expect(timeline).toHaveTextContent('Unsaved changes')
    await user.click(await within(timeline).findByRole('button', { name: 'Select snapshot v2' }))
    await user.click(within(timeline).getByRole('button', { name: 'Snapshot details' }))
    await user.click(within(timeline).getByRole('button', { name: 'Restore v2' }))
    const dialog = screen.getByRole('dialog', { name: 'Restore v2?' })
    expect(dialog).toHaveTextContent('Your unsaved changes in the form will be lost')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Pricing edited')
    expect(calls.some((c) => c.key.startsWith('POST /api/content/pages/pricing/restore'))).toBe(
      false,
    )
  })

  it('refreshes the current snapshot after saving a new version', async () => {
    const doc = aheadDoc()
    openEditor(
      { doc },
      {
        routes: versionRoutes(() => [
          { version: doc.version, title: String(doc.fields.title) },
          { version: 2, title: 'Prices' },
        ]),
      },
    )
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    await within(timeline).findByRole('button', { name: 'Select snapshot v3' })
    const user = userEvent.setup()
    await user.click(within(timeline).getByRole('button', { name: 'Select snapshot v2' }))
    expect(within(timeline).getByRole('slider')).toHaveValue('0')
    await user.type(screen.getByRole('textbox', { name: 'title' }), ' edited')
    await user.click(within(await header()).getByRole('button', { name: 'Save draft' }))
    const newest = await within(timeline).findByRole('button', { name: 'Select snapshot v4' })
    expect(newest).toHaveAttribute('aria-pressed', 'true')
    expect(newest).toHaveTextContent('Current')
    expect(within(timeline).getByRole('button', { name: 'Snapshot details' })).toHaveTextContent(
      'v4',
    )
    expect(within(timeline).getByRole('slider')).toHaveValue('1')
    expect(timeline).not.toHaveTextContent('Unsaved changes')
  })

  it('allows viewers to inspect snapshots but not restore them', async () => {
    open('viewer')
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    await userEvent
      .setup()
      .click(await within(timeline).findByRole('button', { name: 'Select snapshot v2' }))
    await userEvent
      .setup()
      .click(within(timeline).getByRole('button', { name: 'Snapshot details' }))
    expect(within(timeline).queryByRole('button', { name: 'Restore v2' })).toBeNull()
    expect(within(timeline).getByRole('button', { name: 'Preview snapshot' })).toBeEnabled()
  })

  it('reports a snapshot read failure and offers a retry', async () => {
    let attempts = 0
    openEditor(
      { doc: aheadDoc() },
      {
        routes: {
          ...versionRoutes(() => versions),
          'GET /api/content/pages/pricing/versions/3': () =>
            ++attempts === 1
              ? json({ error: 'Unavailable' }, 500)
              : json({
                  metadata: {},
                  contract: null,
                  defaults: [],
                  repositoryBasis: null,

                  meta: { version: 3, createdAt: '2026-10-02T10:00:00Z', changedBy: null },
                  fields: { title: 'Pricing' },
                  body: '<script>bad()</script>\n\nRecovered',
                }),
        },
      },
    )
    const timeline = await screen.findByRole('region', { name: 'Article snapshots' })
    const user = userEvent.setup()
    await within(timeline).findByRole('button', { name: 'Select snapshot v3' })
    await user.click(within(timeline).getByRole('button', { name: 'Snapshot details' }))
    await user.click(within(timeline).getByRole('button', { name: 'Preview snapshot' }))
    const dialog = screen.getByRole('dialog', { name: 'Snapshot v3' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unavailable')
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await within(dialog).findByText('Recovered')).toBeVisible()
    expect(dialog.querySelector('script')).toBeNull()
  })
})
