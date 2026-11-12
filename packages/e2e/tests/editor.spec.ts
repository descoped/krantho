import type { Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  OTHER_USER,
  publishDocument,
  readPublicPage,
  type SeedDocument,
  saveDocument,
  seedForeignLock,
  type Target,
  test,
} from '../src/fixtures.js'

// Services render at /services/<slug> on the target, so a save and a publish can be read
// on the public page. Every document here is the spec's own: earlier specs leave other
// documents with unpublished changes, so statuses are read from the API, never assumed.
const COLLECTION = 'services'

function seedService(slug: string, title: string): SeedDocument {
  return {
    collection: COLLECTION,
    slug,
    fields: {
      title,
      description: `${title}, seeded by the editor spec`,
      ingress: `${title} ingress`,
    },
    body: `## ${title}\n\nSeeded by the editor spec.`,
  }
}

const HEADER = seedService('e2e-editor-header', 'Editor header')
const SAVE = seedService('e2e-editor-save', 'Editor save')
const LEAVE = seedService('e2e-editor-leave', 'Editor leave')
const LOCKED = seedService('e2e-editor-lock', 'Editor lock')

/** A runtime field with a description, so Structure mode has help text to show */
const NOTE_FIELD = {
  name: 'e2e-note',
  type: 'string',
  required: false,
  description: 'A note the editor spec added to the schema',
}

interface Item {
  meta: { slug: string; locale: string; version: number; liveVersion: number | null }
  fields: Record<string, unknown>
}

async function api<T>(target: Target, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL), {
    ...init,
    headers: { 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function readDocument(target: Target, slug: string, locale?: string): Promise<Item> {
  const query = locale ? `?locale=${locale}` : ''
  return api<Item>(target, `/api/content/${COLLECTION}/${slug}${query}`)
}

async function exists(target: Target, slug: string): Promise<boolean> {
  const res = await fetch(new URL(`/api/content/${COLLECTION}/${slug}`, target.baseURL))
  return res.ok
}

/** Create and publish a document once — a worker that restarts finds it already there */
async function seedLive(target: Target, doc: SeedDocument): Promise<void> {
  if (await exists(target, doc.slug)) return
  await createDocument(target, doc)
  await publishDocument(target, COLLECTION, doc.slug)
}

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    await api(target, `/api/schema/${COLLECTION}/fields`, {
      method: 'PUT',
      body: JSON.stringify(NOTE_FIELD),
    })
    for (const doc of [HEADER, SAVE, LEAVE, LOCKED]) await seedLive(target, doc)
    // The header's document has a draft ahead of what is live
    await saveDocument(target, { ...HEADER, fields: { ...HEADER.fields, ingress: 'Ahead' } })
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

async function features(target: Target): Promise<Record<string, string>> {
  const caps = await api<{ features: Record<string, string> }>(target, '/api/capabilities')
  return caps.features
}

function enabled(all: Record<string, string>, feature: string): boolean {
  return (all[feature] ?? 'disabled') !== 'disabled'
}

/** The site's locales as Studio reads them: Setup › Locales, else the configuration */
interface SiteLocales {
  defaultLocale: string
  supportedLocales: string[]
}

/** Whether the target has several locales, as Studio reads them */
async function severalLocales(target: Target): Promise<boolean> {
  const locales = await api<SiteLocales>(target, '/api/settings/locales')
  return locales.supportedLocales.length > 1
}

/** The query that opens Structure mode: a page opens in Live mode without one */
const STRUCTURE = '?mode=structure'

/** Open a document's editor; resolves to its header row */
async function openEditor(page: Page, slug: string, query = ''): Promise<Locator> {
  await page.goto(`/studio/site/${COLLECTION}/${slug}${query}`)
  const tabs = page.getByRole('tablist', { name: 'Mode' })
  await expect(tabs).toBeVisible()
  return tabs.locator('..')
}

/** A field's row in Structure mode */
function fieldRow(page: Page, name: string): Locator {
  return page.locator(`.editor-field[data-field="${name}"]`)
}

test.describe('editor', () => {
  test('the header has the modes that exist, one status chip, locales and the actions — no status select', async ({
    page,
    target,
  }) => {
    const doc = await readDocument(target, HEADER.slug)
    expect(doc.meta.liveVersion).toBeLessThan(doc.meta.version)
    const header = await openEditor(page, HEADER.slug)

    // A page opens in Live mode, the first of its modes
    await expect(header.getByRole('tab')).toHaveText(['Live', 'Structure', 'Data'])
    await expect(header.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true')
    const chip = header.getByRole('button', { name: 'Unpublished changes' })
    await chip.click()
    await expect(header).toContainText(
      `Draft v${doc.meta.version} · live is v${doc.meta.liveVersion}`,
    )
    await expect(header.getByRole('link', { name: /Open on site/ })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Save draft' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
    if (await severalLocales(target)) {
      await expect(header.getByRole('group', { name: 'Locales' })).toBeVisible()
    }

    // No status select anywhere
    await expect(page.getByRole('combobox', { name: /status/i })).toHaveCount(0)
    await expect(page.locator('select:has(option[value="published"])')).toHaveCount(0)
  })

  test('Save draft keeps the live page; Publish, after its confirmation, changes it', async ({
    page,
    target,
  }) => {
    const path = `/${COLLECTION}/${SAVE.slug}`
    const before = await readPublicPage(target, path)
    expect(before.status).toBe(200)
    expect(before.html).toContain('Editor save ingress')

    const header = await openEditor(page, SAVE.slug, STRUCTURE)
    await expect(header.getByRole('button', { name: 'Live' })).toBeVisible()
    const ingress = page.getByRole('textbox', { name: 'ingress', exact: true })
    await ingress.fill('Saved by the editor spec')

    // Hold the save a moment, so its busy state can be seen
    await page.route(`**/api/content/${COLLECTION}/${SAVE.slug}`, async (route) => {
      if (route.request().method() === 'PUT') await new Promise((done) => setTimeout(done, 600))
      await route.continue()
    })
    await header.getByRole('button', { name: 'Save draft' }).click()
    await expect(header.getByRole('button', { name: 'Saving…' })).toBeVisible()

    await expect(header.getByRole('button', { name: 'Unpublished changes' })).toBeVisible()
    const saved = await readDocument(target, SAVE.slug)
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      `v${saved.meta.version}`,
    )
    const unchanged = await readPublicPage(target, path)
    expect(unchanged.html).toContain('Editor save ingress')
    expect(unchanged.html).not.toContain('Saved by the editor spec')

    const impact = await api<{ paths: string[] }>(
      target,
      `/api/content/${COLLECTION}/${SAVE.slug}/publish-impact`,
    )
    await header.getByRole('button', { name: 'Publish', exact: true }).click()
    const dialog = page.getByRole('dialog', {
      name: `Publish ${SAVE.slug} v${saved.meta.version}?`,
    })
    await expect(dialog).toBeVisible()
    for (const refreshed of impact.paths) await expect(dialog).toContainText(refreshed)
    // The confirmation lists the page's SEO findings, and only informs
    if (enabled(await features(target), 'seo')) {
      const { findings } = await api<{ findings: { severity: string }[] }>(
        target,
        `/api/seo/findings/${COLLECTION}/${SAVE.slug}`,
      )
      const flagged = findings.filter((finding) => finding.severity !== 'info')
      await expect(dialog).toContainText(
        flagged.length === 0
          ? `No SEO errors or warnings in v${saved.meta.version}.`
          : `SEO findings in v${saved.meta.version}`,
      )
    } else {
      await expect(dialog).not.toContainText('SEO')
    }
    await dialog.getByRole('button', { name: 'Publish' }).click()

    await expect(header.getByRole('button', { name: 'Live' })).toBeVisible()
    await expect
      .poll(async () => (await readPublicPage(target, path)).html, { timeout: 15_000 })
      .toContain('Saved by the editor spec')
  })

  test('Structure mode shows each field with its label, required or optional, type, SEO use, input and help', async ({
    page,
    target,
  }) => {
    const seo = enabled(await features(target), 'seo')
    await openEditor(page, SAVE.slug, STRUCTURE)

    const title = fieldRow(page, 'title')
    await expect(title.getByRole('textbox', { name: 'title', exact: true })).toBeVisible()
    await expect(title).toContainText('*')
    await expect(title).toContainText('text')
    const order = fieldRow(page, 'order')
    await expect(order).toContainText('optional')
    await expect(order).toContainText('number')

    if (seo) {
      await expect(title).toContainText('used for search as title')
      await expect(fieldRow(page, 'description')).toContainText('meta description')
      await expect(fieldRow(page, 'ingress')).toContainText('backup for meta description')
    }
    await expect(fieldRow(page, 'order')).not.toContainText('used for search')

    const note = page.getByRole('textbox', { name: NOTE_FIELD.name, exact: true })
    await expect(note).toHaveAccessibleDescription(NOTE_FIELD.description)

    const body = page.getByRole('region', { name: 'Body' })
    await expect(body).toContainText('markdown · ## headings become sections')
    await expect(body.getByRole('textbox', { name: 'Body' })).toBeVisible()
  })

  test('a locale chip with "+" creates a draft copied from the default locale', async ({
    page,
    target,
  }) => {
    const { defaultLocale, supportedLocales } = await api<SiteLocales>(
      target,
      '/api/settings/locales',
    )
    const other = supportedLocales.find((locale) => locale !== defaultLocale)
    test.skip(other === undefined, 'the target has one locale')
    if (other === undefined) return
    // A document of its own each run, so the locale version is missing every time
    const doc = seedService(`e2e-editor-locale-${Date.now().toString(36)}`, 'Editor locale')
    await createDocument(target, doc)
    const name = other.toUpperCase()

    const header = await openEditor(page, doc.slug)
    await header.getByRole('button', { name: `Create ${name} draft` }).click()
    const dialog = page.getByRole('dialog', { name: `Create the ${name} draft of ${doc.slug}?` })
    await dialog.getByRole('button', { name: 'Create draft' }).click()

    await expect(page).toHaveURL(new RegExp(`[?&]locale=${other}\\b`))
    await expect(header.getByRole('link', { name: `${name} version` })).toHaveAttribute(
      'aria-current',
      'true',
    )
    const copy = await readDocument(target, doc.slug, other)
    expect(copy.meta.locale).toBe(other)
    expect(copy.meta.liveVersion).toBeNull()
    expect(copy.fields.title).toBe(doc.fields.title)
  })

  test('leaving with unsaved changes asks first, and the kept work is offered back', async ({
    page,
  }) => {
    await openEditor(page, LEAVE.slug, STRUCTURE)
    const ingress = page.getByRole('textbox', { name: 'ingress', exact: true })
    await ingress.fill('Unsaved work')
    const nav = page.getByRole('navigation', { name: 'Studio' })

    await nav.getByRole('link', { name: 'Pulse' }).click()
    const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Stay' }).click()
    await expect(ingress).toHaveValue('Unsaved work')

    await nav.getByRole('link', { name: 'Pulse' }).click()
    await page
      .getByRole('dialog', { name: 'Leave without saving?' })
      .getByRole('button', {
        name: 'Leave',
      })
      .click()
    await expect(page).toHaveURL(/\/studio\/?$/)

    await openEditor(page, LEAVE.slug, STRUCTURE)
    const kept = page.getByRole('region', { name: 'Unsaved changes kept in this browser' })
    await kept.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByRole('textbox', { name: 'ingress', exact: true })).toHaveValue(
      'Unsaved work',
    )
  })

  test('while another user holds the lock the editor is read-only and the lock chip names them', async ({
    page,
    target,
  }) => {
    await seedForeignLock(target, COLLECTION, LOCKED.slug)
    const header = await openEditor(page, LOCKED.slug, STRUCTURE)

    await expect(header.getByRole('button', { name: `${OTHER_USER} is editing` })).toBeVisible()
    const boxes = page.getByRole('main').getByRole('textbox')
    await expect(boxes.first()).toBeVisible()
    for (const box of await boxes.all()) await expect(box).toBeDisabled()
    await expect(header.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(header.getByRole('button', { name: 'Publish', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
