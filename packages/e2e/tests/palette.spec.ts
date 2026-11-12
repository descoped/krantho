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

const COLLECTION = 'services'

/** A word no example document contains, so a search finds only the seeded one */
const FINDABLE_WORD = 'zephyrquartz'

const FINDABLE: SeedDocument = {
  collection: COLLECTION,
  slug: 'e2e-palette-findable',
  fields: {
    title: `Palette ${FINDABLE_WORD}`,
    description: 'Seeded by the palette spec',
    ingress: 'Palette spec',
  },
}

const AHEAD: SeedDocument = {
  collection: COLLECTION,
  slug: 'e2e-palette-ahead',
  fields: { title: 'Palette ahead', description: 'Seeded by the palette spec', ingress: 'First' },
}

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    await createDocument(target, FINDABLE)
    await createDocument(target, AHEAD)
    await publishDocument(target, COLLECTION, AHEAD.slug)
    await saveDocument(target, { ...AHEAD, fields: { ...AHEAD.fields, ingress: 'Saved again' } })
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

interface Versions {
  version: number
  liveVersion: number | null
}

async function versionsOf(target: Target, slug: string): Promise<Versions> {
  const res = await fetch(new URL(`/api/content/${COLLECTION}/${slug}`, target.baseURL))
  const { meta } = (await res.json()) as { meta: Versions }
  return meta
}

/** The commands the site's capabilities allow an admin (auth mode none) */
async function expectedCommands(target: Target): Promise<string[]> {
  const res = await fetch(new URL('/api/capabilities', target.baseURL))
  const { features } = (await res.json()) as { features: Record<string, string> }
  const on = (feature: string): boolean =>
    features[feature] !== undefined && features[feature] !== 'disabled'
  return [
    'New page',
    'Publish all drafts ahead of live',
    ...(on('checkpoints') ? ['Create checkpoint'] : []),
    ...(on('seo') ? ['Enrich missing SEO', 'Structure'] : []),
  ]
}

function palette(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Command palette' })
}

async function openStudio(page: Page): Promise<void> {
  await page.goto('/studio')
  await expect(page.getByRole('navigation', { name: 'Studio' })).toBeVisible()
}

test.describe('command palette', () => {
  test('⌘K and Ctrl+K open it', async ({ page }) => {
    await openStudio(page)
    await page.keyboard.press('Meta+K')
    await expect(palette(page)).toBeVisible()
    await expect(palette(page).getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()

    await page.keyboard.press('Control+K')
    await expect(palette(page)).toBeVisible()
  })

  test('with no query it lists the commands', async ({ page, target }) => {
    await openStudio(page)
    await page.getByRole('button', { name: 'Search or command' }).click()
    const commands = palette(page).getByRole('listbox', { name: 'Commands' })
    const labels = await expectedCommands(target)
    await expect(commands.getByRole('option')).toHaveCount(labels.length)
    for (const [index, label] of labels.entries()) {
      await expect(commands.getByRole('option').nth(index)).toContainText(label)
    }
  })

  test('"Publish all drafts ahead of live" asks before publishing', async ({ page, target }) => {
    await openStudio(page)
    await page.keyboard.press('Control+K')
    await palette(page)
      .getByRole('option', { name: /Publish all drafts ahead of live/ })
      .click()

    const confirm = page.getByRole('dialog', { name: 'Publish all drafts ahead of live' })
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText(/unpublished changes/)
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()

    // Cancel publishes nothing
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()
    const before = await versionsOf(target, AHEAD.slug)
    expect(before.liveVersion).toBeLessThan(before.version)

    // Confirming publishes the saved version
    await page.keyboard.press('Control+K')
    await palette(page)
      .getByRole('option', { name: /Publish all drafts ahead of live/ })
      .click()
    await confirm.getByRole('button', { name: /^Publish \d+ documents?$/ }).click()
    await expect(confirm.getByRole('status')).toContainText(/Published \d+ documents?/)
    const after = await versionsOf(target, AHEAD.slug)
    expect(after.liveVersion).toBe(after.version)
  })

  test('a query lists matching documents and Enter opens one', async ({ page }) => {
    await openStudio(page)
    await page.keyboard.press('Control+K')
    await palette(page).getByRole('combobox').fill(FINDABLE_WORD)

    const documents = palette(page).getByRole('listbox', { name: 'Documents' })
    await expect(documents.getByRole('option')).toHaveCount(1)
    await expect(documents.getByRole('option').first()).toContainText(`Palette ${FINDABLE_WORD}`)

    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/studio/site/${COLLECTION}/${FINDABLE.slug}$`))
  })

  test('Esc closes it and focus returns to where it was', async ({ page }) => {
    await openStudio(page)
    const button = page.getByRole('button', { name: 'Search or command' })
    await button.click()
    await expect(palette(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()
    await expect(button).toBeFocused()
  })
})
