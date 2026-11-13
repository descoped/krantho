import { readFileSync } from 'node:fs'
import type { RepositoryDocument } from '@krantho/persistence'
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

const COLLECTION = 'pages'

function seedPage(slug: string, title: string): SeedDocument {
  return {
    collection: COLLECTION,
    slug,
    fields: { title, description: 'Seeded by the site spec' },
    body: `## ${title}\n\nSeeded by the site spec.`,
  }
}

/** One document in each state of the status model */
const LIVE = seedPage('e2e-site-live', 'Site live')
const AHEAD = seedPage('e2e-site-ahead', 'Site ahead')
const DRAFT = seedPage('e2e-site-draft', 'Site draft')
/** Drafts the bulk Publish makes live */
const PUBLISH_A = seedPage('e2e-site-publish-a', 'Site publish A')
const PUBLISH_B = seedPage('e2e-site-publish-b', 'Site publish B')
/** Exported, changed, then imported back */
const ROUND_TRIP = seedPage('e2e-site-round-trip', 'Site round trip')

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    await createDocument(target, LIVE)
    await publishDocument(target, COLLECTION, LIVE.slug)
    await createDocument(target, AHEAD)
    await publishDocument(target, COLLECTION, AHEAD.slug)
    await saveDocument(target, {
      ...AHEAD,
      fields: { ...AHEAD.fields, description: 'Saved again' },
    })
    for (const doc of [DRAFT, PUBLISH_A, PUBLISH_B, ROUND_TRIP]) {
      await createDocument(target, doc)
    }
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

// ---------------------------------------------------------------------------
// What the API says — expected rows are computed from it, never hard-coded
// ---------------------------------------------------------------------------

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

interface Item {
  meta: { slug: string; version: number; liveVersion: number | null; createdAt: string }
  fields: Record<string, unknown>
  body: string
}

/** The site's default locale, as Studio reads it: Setup › Locales, else the configuration */
async function defaultLocale(target: Target): Promise<string> {
  const locales = await api<{ defaultLocale: string }>(target, '/api/settings/locales')
  return locales.defaultLocale
}

/** Every document of a collection in the default locale (the collection view's), page by page */
async function listAll(target: Target, collection: string): Promise<Item[]> {
  const locale = await defaultLocale(target)
  const items: Item[] = []
  const seen = new Set<string>()
  for (;;) {
    const query = `locale=${locale}&sort=slug&limit=100&offset=${items.length}`
    const page = await api<{ items: Item[] }>(target, `/api/content/${collection}?${query}`)
    const fresh = page.items.filter((item) => !seen.has(item.meta.slug))
    if (fresh.length === 0) return items
    for (const item of fresh) seen.add(item.meta.slug)
    items.push(...fresh)
  }
}

async function findDocument(target: Target, slug: string): Promise<Item | undefined> {
  return (await listAll(target, COLLECTION)).find((item) => item.meta.slug === slug)
}

type Status = 'live' | 'ahead' | 'draft'

function statusOf({ meta }: Item): Status {
  if (meta.liveVersion === null) return 'draft'
  return meta.liveVersion >= meta.version ? 'live' : 'ahead'
}

function label(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ---------------------------------------------------------------------------

async function openOverview(page: Page): Promise<Locator> {
  await page.goto('/studio/site')
  const main = page.getByRole('main')
  await expect(main.getByRole('region', { name: 'Layout' })).toBeVisible()
  return main
}

async function openCollection(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/studio/site/${COLLECTION}${query}`)
  const listing = page
    .getByRole('main')
    .getByRole('region', { name: `${label(COLLECTION)} documents` })
  await expect(listing.getByRole('table')).toBeVisible()
  return listing
}

/** The slugs of the shown rows, in order — each row's first link is its slug */
async function shownSlugs(listing: Locator): Promise<string[]> {
  const rows = listing.getByRole('table').locator('tbody tr')
  return rows.evaluateAll((trs) =>
    trs.map((tr) => tr.querySelector('a')?.textContent?.trim() ?? ''),
  )
}

async function columnHeaders(table: Locator): Promise<string[]> {
  const texts = await table.getByRole('columnheader').allTextContents()
  return texts.map((text) => text.trim()).filter((text) => text !== '')
}

test.describe('site', () => {
  test('the overview shows one section per collection plus Layout, with the §3 columns', async ({
    page,
    target,
  }) => {
    const { collections } = await api<{ collections: Array<{ name: string }> }>(
      target,
      '/api/collections',
    )
    // Studio reads the locales from Setup › Locales (else the configuration): several show the column
    const { supportedLocales } = await api<{ supportedLocales: string[] }>(
      target,
      '/api/settings/locales',
    )
    const expected = [
      'Page',
      'Status',
      'Findability',
      ...(supportedLocales.length > 1 ? ['Locales'] : []),
      'Updated',
    ]
    const main = await openOverview(page)
    for (const { name } of collections) {
      const section = main.getByRole('region', {
        name: name === 'globals' ? 'Layout' : label(name),
      })
      await expect(section).toBeVisible()
      const table = section.getByRole('table')
      if ((await table.count()) === 0) continue
      expect(await columnHeaders(table)).toEqual(expected)
    }
    const layout = main.getByRole('region', { name: 'Layout' })
    await expect(layout).toContainText('no URL, shared')
    await expect(layout).toContainText('Read by every page')
    const live = main.getByRole('region', { name: label(COLLECTION) })
    const row = live.locator('tr', {
      has: page.getByRole('link', { name: LIVE.fields.title as string }),
    })
    await expect(row).toContainText('Live')
    await expect(row.getByRole('link', { name: /\/e2e-site-live on the site/ })).toHaveAttribute(
      'target',
      '_blank',
    )
  })

  test('the collection view filters by status and shows the shown-count', async ({
    page,
    target,
  }) => {
    const items = await listAll(target, COLLECTION)
    const listing = await openCollection(page)
    await expect(listing).toContainText(`${items.length} of ${items.length} shown`)
    const filters: Array<[string, Status]> = [
      ['Live', 'live'],
      ['Unpublished changes', 'ahead'],
      ['Not published', 'draft'],
    ]
    for (const [name, status] of filters) {
      await listing.getByRole('button', { name: new RegExp(`^${name}`) }).click()
      const expected = items.filter((item) => statusOf(item) === status).map((i) => i.meta.slug)
      await expect(listing).toContainText(`${expected.length} of ${items.length} shown`)
      expect((await shownSlugs(listing)).sort()).toEqual([...expected].sort())
    }
    await listing.getByRole('button', { name: /^All/ }).click()
    await expect(listing).toContainText(`${items.length} of ${items.length} shown`)
  })

  test('the collection view sorts by updated or by slug', async ({ page, target }) => {
    const items = await listAll(target, COLLECTION)
    const bySlug = items.map((i) => i.meta.slug).sort((a, b) => a.localeCompare(b))
    const byUpdated = [...items]
      .sort(
        (a, b) =>
          b.meta.createdAt.localeCompare(a.meta.createdAt) ||
          a.meta.slug.localeCompare(b.meta.slug),
      )
      .map((i) => i.meta.slug)
    const listing = await openCollection(page)
    expect(await shownSlugs(listing)).toEqual(byUpdated)
    await listing.getByLabel('Sort').selectOption('slug')
    await expect.poll(() => shownSlugs(listing)).toEqual(bySlug)
    await listing.getByLabel('Sort').selectOption('updated')
    await expect.poll(() => shownSlugs(listing)).toEqual(byUpdated)
  })

  test('bulk Publish, after its confirmation, makes the selected drafts live', async ({
    page,
    target,
  }) => {
    const listing = await openCollection(page)
    await listing.getByRole('checkbox', { name: `Select ${PUBLISH_A.slug}` }).check()
    await listing.getByRole('checkbox', { name: `Select ${PUBLISH_B.slug}` }).check()
    const bar = listing.getByRole('region', { name: 'Selection' })
    await expect(bar).toContainText('2 selected')
    await bar.getByRole('button', { name: 'Publish' }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish documents' })
    await expect(dialog).toContainText('Publish 2 documents')
    expect(statusOf((await findDocument(target, PUBLISH_A.slug)) as Item)).toBe('draft')
    await dialog.getByRole('button', { name: 'Publish 2 documents' }).click()
    await expect(dialog).toContainText('Published 2 documents.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    for (const slug of [PUBLISH_A.slug, PUBLISH_B.slug]) {
      expect(statusOf((await findDocument(target, slug)) as Item)).toBe('live')
      const row = listing.locator('tr', {
        has: page.getByRole('link', { name: slug, exact: true }),
      })
      await expect(row).toContainText('Live')
    }
  })

  test('bulk Delete, after its confirmation, removes the selected document', async ({
    page,
    target,
  }) => {
    const doomed = seedPage(`e2e-site-delete-${Date.now().toString(36)}`, 'Site delete')
    await createDocument(target, doomed)
    const listing = await openCollection(page)
    await listing.getByRole('checkbox', { name: `Select ${doomed.slug}` }).check()
    await listing
      .getByRole('region', { name: 'Selection' })
      .getByRole('button', { name: 'Delete' })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Delete documents' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await findDocument(target, doomed.slug)).toBeDefined()
    await listing
      .getByRole('region', { name: 'Selection' })
      .getByRole('button', { name: 'Delete' })
      .click()
    await dialog.getByRole('button', { name: 'Delete 1 document' }).click()
    await expect(dialog).toContainText('Deleted 1 document.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(listing.getByRole('link', { name: doomed.slug, exact: true })).toHaveCount(0)
    expect(await findDocument(target, doomed.slug)).toBeUndefined()
  })

  test('Export downloads JSON, and Import of that file round-trips', async ({ page, target }) => {
    await openCollection(page)
    const main = page.getByRole('main')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main.getByRole('button', { name: 'Export' }).click(),
    ])
    expect(download.suggestedFilename()).toBe(`${COLLECTION}-en.json`)
    const file = await download.path()
    const exported = JSON.parse(readFileSync(file, 'utf8')) as { items: RepositoryDocument[] }
    const original = exported.items.find((item) => item.identity.slug === ROUND_TRIP.slug)
    expect(original?.fields.title).toBe(ROUND_TRIP.fields.title)

    // Edit the exported content while keeping its basis for a conflict-safe import.
    if (!original) throw new Error('The export omitted the round-trip document')
    original.fields.title = 'Edited in repository'

    await main.getByRole('button', { name: 'Import' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import documents' })
    await dialog.getByLabel('Choose file').setInputFiles({
      name: 'pages-en.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    })
    await expect(dialog.getByLabel('JSON')).not.toHaveValue('')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toContainText(/Imported \d+ of \d+/)
    await dialog.getByRole('button', { name: 'Close' }).click()

    const restored = await findDocument(target, ROUND_TRIP.slug)
    expect(restored?.fields.title).toBe('Edited in repository')
    expect(original.identity).toEqual({
      collection: COLLECTION,
      slug: ROUND_TRIP.slug,
      locale: 'en',
    })
    expect(original.contract).not.toBeNull()
    expect(original.metadata).toBeDefined()
    expect(restored?.body.trim()).toBe(original?.body.trim())

    // A stale export cannot overwrite a later database edit.
    await saveDocument(target, {
      ...ROUND_TRIP,
      fields: { ...ROUND_TRIP.fields, title: 'Changed in the database' },
    })
    await main.getByRole('button', { name: 'Import' }).click()
    await dialog.getByLabel('JSON').fill(JSON.stringify({ items: [original] }))
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toContainText('Repository and database changes need an explicit review')
    await dialog.getByRole('button', { name: 'Close' }).click()
    expect((await findDocument(target, ROUND_TRIP.slug))?.fields.title).toBe(
      'Changed in the database',
    )
  })

  test.describe('below 640px', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the tables render as stacked cards with labelled cells', async ({ page }) => {
      for (const open of [openOverview, openCollection]) {
        const scope = await open(page)
        const table = scope.getByRole('table').first()
        const shape = await table.evaluate((element) => {
          const row = element.querySelector('tbody tr') as HTMLElement
          const status = row.querySelector('td[data-label="Status"]') as HTMLElement
          const header = element.querySelector('th[scope="col"]:not(.ui-data-table-select)')
          return {
            row: getComputedStyle(row).display,
            header: header ? getComputedStyle(header).display : 'none',
            label: getComputedStyle(status, '::before').content,
          }
        })
        expect(shape).toEqual({ row: 'flex', header: 'none', label: '"Status"' })
        // The cards fit the page: nothing in it scrolls sideways
        const overflow = await page
          .getByRole('main')
          .evaluate((main) => main.scrollWidth - main.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      }
    })
  })
})
