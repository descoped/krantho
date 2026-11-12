import type { Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  OTHER_USER,
  pageDocument,
  publishDocument,
  readPublicPage,
  type SeedDocument,
  seedForeignLock,
  type Target,
  test,
} from '../src/fixtures.js'

// The flows Studio carries on every stack: navigation, opening a document, Save draft (the
// live page is unchanged), Publish (the live page changes) and an enforced lock. Each test
// writes its own document to the target's page collection (`site.pages`: services on the
// examples, features on krantho.com) and reads its page as a visitor does.

interface Item {
  meta: { version: number; liveVersion: number | null }
  fields: Record<string, unknown>
}

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

function documentPath(doc: SeedDocument): string {
  return `/api/content/${doc.collection}/${doc.slug}`
}

async function readDocument(target: Target, doc: SeedDocument): Promise<Item> {
  return api<Item>(target, documentPath(doc))
}

/** A document of its own for each test: created and published, so it has a live page */
async function seedLive(target: Target, name: string, title: string): Promise<SeedDocument> {
  const slug = `e2e-flow-${name}-${Date.now().toString(36)}`
  const doc = pageDocument(target, slug, title, `## ${title}\n\nWritten by the core flows spec.`)
  await createDocument(target, doc)
  await publishDocument(target, doc.collection, doc.slug)
  return doc
}

/** The field the target's page renders beside the title, and the value the spec seeded */
function shown(target: Target, doc: SeedDocument): { field: string; seeded: string } {
  const field = target.site.pages.shown
  return { field, seeded: String(doc.fields[field]) }
}

/** A collection's name as Studio labels it: `services` reads "Services" */
function label(collection: string): string {
  return collection.charAt(0).toUpperCase() + collection.slice(1)
}

function navigation(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Studio' })
}

/** Open a document's editor in Structure mode; resolves to its header row */
async function openEditor(page: Page, doc: SeedDocument): Promise<Locator> {
  await page.goto(`/studio/site/${doc.collection}/${doc.slug}?mode=structure`)
  const tabs = page.getByRole('tablist', { name: 'Mode' })
  await expect(tabs).toBeVisible()
  return tabs.locator('..')
}

/** Expect the visitor's page to read `expected`; a target whose pages never read krantho is noted */
async function expectLivePage(target: Target, path: string, expected: string): Promise<void> {
  if (!target.site.rendersPublished) return
  await expect
    .poll(async () => (await readPublicPage(target, path)).html, { timeout: 15_000 })
    .toContain(expected)
}

test.describe('core flows', () => {
  test('navigation: each destination opens from the navigation and is marked current', async ({
    page,
  }) => {
    await page.goto('/studio')
    const destinations = navigation(page).getByRole('list', { name: 'Destinations' })
    await expect(destinations.getByRole('link').first()).toBeVisible()
    const names = (await destinations.getByRole('link').allTextContents()).map((n) => n.trim())
    expect(names).toEqual(expect.arrayContaining(['Pulse', 'Site', 'Setup']))

    for (const name of names) {
      const link = destinations.getByRole('link', { name, exact: true })
      const href = await link.getAttribute('href')
      await link.click()
      // A destination with tabs opens on its first (Structure on Graph)
      await expect(page).toHaveURL(new RegExp(`${href ?? ''}(/[\\w-]+)?/?$`))
      // `page` on the destination's own path, `true` on a tab it opens to (Setup)
      await expect(link).toHaveAttribute('aria-current', /^(page|true)$/)
      await expect(page.getByRole('main')).toBeVisible()
    }
  })

  test('opening a document: the site tree leads to its collection, and the collection to the document', async ({
    page,
    target,
  }) => {
    const doc = await seedLive(target, 'open', 'Flow open')
    const name = label(doc.collection)
    await page.goto('/studio')

    const group = navigation(page)
      .getByRole('group', { name: 'Site tree' })
      .getByRole('group', { name, exact: true })
    await group.getByRole('link', { name: new RegExp(`^${name} /`) }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/site/${doc.collection}$`))

    const listing = page.getByRole('main').getByRole('region', { name: `${name} documents` })
    await listing.getByRole('link', { name: doc.slug, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/site/${doc.collection}/${doc.slug}`))
    await expect(page.getByRole('tablist', { name: 'Mode' })).toBeVisible()

    await page.getByRole('tab', { name: 'Structure' }).click()
    await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue(
      String(doc.fields['title']),
    )
  })

  test('Save draft keeps the live page as a visitor reads it', async ({ page, target }) => {
    const doc = await seedLive(target, 'save', 'Flow save')
    const { field, seeded } = shown(target, doc)
    const path = target.site.pages.path(doc.slug)
    await expectLivePage(target, path, seeded)

    const header = await openEditor(page, doc)
    const draft = `Saved by the core flows spec on ${target.site.name}`
    await page.getByRole('textbox', { name: field, exact: true }).fill(draft)
    await header.getByRole('button', { name: 'Save draft' }).click()
    await expect(header.getByRole('button', { name: 'Unpublished changes' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      'The live page is unchanged until you publish.',
    )

    const saved = await readDocument(target, doc)
    expect(saved.fields[field]).toBe(draft)
    expect(saved.meta.liveVersion).toBeLessThan(saved.meta.version)
    if (target.site.rendersPublished) {
      const visitor = await readPublicPage(target, path)
      expect(visitor.status).toBe(200)
      expect(visitor.html).toContain(seeded)
      expect(visitor.html).not.toContain(draft)
    }
  })

  test('Publish, after its confirmation, changes the live page', async ({ page, target }) => {
    test
      .info()
      .annotations.push(
        ...(target.site.rendersPublished
          ? []
          : [
              { type: 'gap', description: 'the pages render build-time JSON, not krantho content' },
            ]),
      )
    const doc = await seedLive(target, 'publish', 'Flow publish')
    const { field } = shown(target, doc)
    const path = target.site.pages.path(doc.slug)

    const header = await openEditor(page, doc)
    const published = `Published by the core flows spec on ${target.site.name}`
    await page.getByRole('textbox', { name: field, exact: true }).fill(published)
    await header.getByRole('button', { name: 'Save draft' }).click()
    await expect(header.getByRole('button', { name: 'Unpublished changes' })).toBeVisible()
    const saved = await readDocument(target, doc)

    await header.getByRole('button', { name: 'Publish', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Publish ${doc.slug} v${saved.meta.version}?` })
    await dialog.getByRole('button', { name: 'Publish' }).click()
    await expect(header.getByRole('button', { name: 'Live' })).toBeVisible()

    // What is live is the document's current version, at least the one saved before
    const live = await readDocument(target, doc)
    expect(live.meta.liveVersion).toBe(live.meta.version)
    expect(live.meta.version).toBeGreaterThanOrEqual(saved.meta.version)
    expect(live.fields[field]).toBe(published)
    await expectLivePage(target, path, published)
  })

  test('a lock another user holds makes the editor read-only and refuses the save', async ({
    page,
    target,
  }) => {
    const doc = await seedLive(target, 'lock', 'Flow lock')
    await seedForeignLock(target, doc.collection, doc.slug)
    const before = await readDocument(target, doc)

    const header = await openEditor(page, doc)
    await expect(header.getByRole('button', { name: `${OTHER_USER} is editing` })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'title', exact: true })).toBeDisabled()
    await expect(header.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // The API refuses the save Studio would send, and names the holder
    const res = await fetch(new URL(documentPath(doc), target.baseURL), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { ...doc.fields, title: 'Saved through a lock' } }),
    })
    expect(res.status).toBe(423)
    expect(((await res.json()) as { lockedBy?: string }).lockedBy).toBe(OTHER_USER)
    expect((await readDocument(target, doc)).meta.version).toBe(before.meta.version)
  })
})
