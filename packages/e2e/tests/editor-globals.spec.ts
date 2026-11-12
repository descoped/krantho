import type { Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  publishDocument,
  type SeedDocument,
  saveDocument,
  type Target,
  test,
} from '../src/fixtures.js'

// The globals editor on the spec's own global: published as v2, then saved as
// v3, so it has a live version, a newer current one and a history to diff and
// restore. It is the spec's own, so the site's shared header and footer stay
// as the other specs expect them.
const COLLECTION = 'globals'
const SLUG = 'e2e-globals'

const DOC: SeedDocument = {
  collection: COLLECTION,
  slug: SLUG,
  fields: { 'footer-title': 'Globals spec' },
}

/** The banner Where it appears shows, verbatim from the spec (§4) */
const BANNER =
  'A global has no page of its own. Publishing it marks every page that reads it stale; they refresh as visitors open them.'

interface Item {
  meta: { version: number; liveVersion: number | null }
  fields: Record<string, unknown>
}

interface Impact {
  paths: string[]
  everyPageReading: boolean
  cachedEntries: number | null
}

interface Versions {
  versions: Array<{ version: number }>
}

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

const DOCUMENT_PATH = `/api/content/${COLLECTION}/${SLUG}`

/** Seed once: create, publish, save again — a worker that restarts finds it already there */
async function seed(target: Target): Promise<void> {
  const res = await fetch(new URL(DOCUMENT_PATH, target.baseURL))
  if (res.ok) return
  await createDocument(target, DOC)
  await publishDocument(target, COLLECTION, SLUG)
  await saveDocument(target, { ...DOC, fields: { 'footer-title': 'Globals spec, revised' } })
}

let seeding: Promise<void> | null = null

test.beforeEach(async ({ target }) => {
  seeding ??= seed(target)
  await seeding
})

/** Open the global's editor; resolves to its header row */
async function openGlobal(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/studio/layout/${SLUG}${query}`)
  const tabs = page.getByRole('tablist', { name: 'Mode' })
  await expect(tabs).toBeVisible()
  return tabs.locator('..')
}

function card(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('region', { name, exact: true })
}

test.describe('globals editor', () => {
  test('has Fields and Where it appears, with no Live mode and no Open on site', async ({
    page,
  }) => {
    const header = await openGlobal(page)
    await expect(header.getByRole('tab')).toHaveText(['Fields', 'Where it appears'])
    await expect(header.getByRole('tab', { name: 'Fields' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(header.getByRole('tab', { name: 'Live' })).toHaveCount(0)
    await expect(header.getByRole('tab', { name: 'Data' })).toHaveCount(0)
    await expect(header.getByRole('link', { name: /Open on site/ })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'footer-title', exact: true })).toHaveValue(
      'Globals spec, revised',
    )

    // The tabs move with the arrow keys; the mode is kept in the address
    await header.getByRole('tab', { name: 'Fields' }).focus()
    await page.keyboard.press('ArrowRight')
    const where = header.getByRole('tab', { name: 'Where it appears' })
    await expect(where).toBeFocused()
    await expect(where).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/[?&]mode=where/)

    // A page's modes are not a global's: the address falls back to Fields
    await openGlobal(page, '?mode=live')
    await expect(page.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true')
  })

  test('Where it appears shows the banner and the pages that read it as far as krantho knows', async ({
    page,
    target,
  }) => {
    const impact = await api<Impact>(target, `${DOCUMENT_PATH}/publish-impact`)
    await openGlobal(page, '?mode=where')
    await expect(page.getByRole('tabpanel').getByRole('note')).toHaveText(BANNER)

    const readers = card(page, 'Pages that read it')
    for (const path of impact.paths) await expect(readers).toContainText(path)
    if (impact.everyPageReading) {
      await expect(readers).toContainText('Every page that reads it.')
    }
    if (impact.paths.length === 0) await expect(readers.getByRole('list')).toHaveCount(0)
    if (impact.cachedEntries === null) {
      await expect(readers).not.toContainText('cached entr')
    } else {
      await expect(readers).toContainText(`${impact.cachedEntries} cached entr`)
    }
  })

  test('Where it appears has the history, with Diff and a restore that creates a new version', async ({
    page,
    target,
  }) => {
    const path = `${DOCUMENT_PATH}/versions`
    const before = (await api<Versions>(target, path)).versions
    const newest = before[0]?.version ?? 0
    await openGlobal(page, '?mode=where')
    const history = card(page, 'History')
    const rows = history.getByRole('list', { name: 'Versions' }).getByRole('listitem')
    await expect(rows.first()).toContainText(`v${newest}`)
    await expect(rows.first()).toContainText('current')

    await history.getByRole('button', { name: `Diff v${newest} with the version before` }).click()
    await expect(
      history.getByRole('heading', { name: `v${newest - 1} → v${newest}` }),
    ).toBeFocused()
    await history.getByRole('button', { name: 'Close the diff' }).click()

    await history.getByRole('button', { name: `Restore v${newest - 1}` }).click()
    const dialog = page.getByRole('dialog', { name: `Restore v${newest - 1}?` })
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(rows.first()).toContainText(`v${newest + 1}`)
    const after = (await api<Versions>(target, path)).versions
    expect(after[0]?.version).toBe(newest + 1)
  })

  test('Publish works as for a page: it confirms what it refreshes and makes the version live', async ({
    page,
    target,
  }) => {
    const header = await openGlobal(page)
    const before = await api<Item>(target, DOCUMENT_PATH)
    const version = before.meta.version + 1
    await page.getByRole('textbox', { name: 'footer-title', exact: true }).fill('Published global')
    await header.getByRole('button', { name: 'Save draft' }).click()
    // The save's own toast is the point it has landed: the chip already read Unpublished changes
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      `Draft saved · v${version}.`,
    )

    await header.getByRole('button', { name: 'Publish', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Publish ${SLUG} v${version}?` })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('every page that reads it, as visitors open them')
    await dialog.getByRole('button', { name: 'Publish' }).click()

    await expect(header.getByRole('button', { name: 'Live' })).toBeVisible()
    // The publication of v<version> is recorded as a new version, which is the live one
    const live = await api<Item>(target, DOCUMENT_PATH)
    expect(live.meta.version).toBeGreaterThan(version)
    expect(live.meta.liveVersion).toBe(live.meta.version)
    expect(live.fields['footer-title']).toBe('Published global')
  })
})
