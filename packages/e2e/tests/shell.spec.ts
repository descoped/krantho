import type { Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  OTHER_USER,
  publishDocument,
  type SeedDocument,
  saveDocument,
  seedForeignLock,
  type Target,
  test,
} from '../src/fixtures.js'

const COLLECTION = 'services'

function service(slug: string, title: string): SeedDocument {
  return {
    collection: COLLECTION,
    slug,
    fields: { title, description: 'Seeded by the shell spec', ingress: 'Shell spec' },
  }
}

/** Three documents, one in each state of the status model */
const LIVE = service('e2e-shell-live', 'Shell live')
const AHEAD = service('e2e-shell-ahead', 'Shell ahead')
const DRAFT = service('e2e-shell-draft', 'Shell draft')

let seeding: Promise<void> | null = null

/** Seed once per run: live (created, published), ahead (published, saved again), draft (created) */
function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    await createDocument(target, LIVE)
    await publishDocument(target, COLLECTION, LIVE.slug)
    await createDocument(target, AHEAD)
    await publishDocument(target, COLLECTION, AHEAD.slug)
    await saveDocument(target, { ...AHEAD, fields: { ...AHEAD.fields, ingress: 'Saved again' } })
    await createDocument(target, DRAFT)
    await seedForeignLock(target, COLLECTION, LIVE.slug)
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

function navigation(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Studio' })
}

function siteTree(page: Page): Locator {
  return navigation(page).getByRole('group', { name: 'Site tree' })
}

/** A link whose name holds this word — a row's name also reads its status and lock */
function named(word: string): RegExp {
  return new RegExp(`(^|\\s)${word}(\\s|$)`)
}

/** A document's row in the site tree */
function treeDocument(page: Page, group: string, slug: string): Locator {
  return siteTree(page)
    .getByRole('group', { name: group, exact: true })
    .getByRole('link', { name: named(slug) })
}

async function openStudio(page: Page, path = '/studio'): Promise<void> {
  await page.goto(path)
  await expect(navigation(page)).toBeVisible()
}

test.describe('shell', () => {
  test('the navigation shows Pulse, Site, Structure, Media and Setup in that order', async ({
    page,
  }) => {
    await openStudio(page)
    const destinations = navigation(page).getByRole('list', { name: 'Destinations' })
    await expect(destinations.getByRole('link')).toHaveText([
      'Pulse',
      'Site',
      'Structure',
      'Media',
      'Setup',
    ])
  })

  test('the site tree has a group per collection, labelled with its URL path and a new entry, and a Layout group without one', async ({
    page,
  }) => {
    await openStudio(page)
    const tree = siteTree(page)
    for (const [group, singular, urlPath] of [
      ['Pages', 'page', '/'],
      ['Services', 'service', '/services'],
    ] as const) {
      const section = tree.getByRole('group', { name: group, exact: true })
      // Labelled with the collection and the URL path its pages live at
      await expect(
        section.getByRole('link', { name: `${group} ${urlPath}`, exact: true }),
      ).toBeVisible()
      const create = section.getByRole('link', { name: `New ${singular}` })
      await expect(create).toHaveAttribute('href', `/studio/new/${group.toLowerCase()}`)
    }
    const layout = tree.getByRole('group', { name: 'Layout', exact: true })
    await expect(layout.getByRole('link', { name: named('footer') })).toBeVisible()
    await expect(layout.getByRole('link', { name: /^New / })).toHaveCount(0)
    await expect(tree.getByRole('list', { name: 'Status legend' })).toHaveText(
      /live\s*draft ahead\s*draft/,
    )
  })

  test('status dots read Live, Unpublished changes and Not published', async ({ page }) => {
    await openStudio(page)
    const cases = [
      [LIVE.slug, 'Live'],
      [AHEAD.slug, 'Unpublished changes'],
      [DRAFT.slug, 'Not published'],
    ] as const
    for (const [slug, status] of cases) {
      const row = treeDocument(page, 'Services', slug)
      await expect(row.getByRole('img', { name: status, exact: true })).toBeVisible()
    }
  })

  test('a lock icon shows on a document another user holds', async ({ page }) => {
    await openStudio(page)
    const lock = { name: `Locked by ${OTHER_USER}` }
    await expect(treeDocument(page, 'Services', LIVE.slug).getByRole('img', lock)).toBeVisible()
    await expect(treeDocument(page, 'Services', DRAFT.slug).getByRole('img', lock)).toHaveCount(0)
  })

  test('the open document is highlighted', async ({ page }) => {
    await openStudio(page)
    const row = treeDocument(page, 'Services', DRAFT.slug)
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/studio/site/${COLLECTION}/${DRAFT.slug}$`))
    await expect(row).toHaveAttribute('aria-current', 'page')
    await expect(treeDocument(page, 'Services', LIVE.slug)).not.toHaveAttribute('aria-current')
  })

  test('the navigation collapses to 66px and expands again', async ({ page }) => {
    await openStudio(page)
    const nav = navigation(page)
    const width = async (): Promise<number | undefined> => (await nav.boundingBox())?.width
    await expect.poll(width).toBe(236)

    await page.getByRole('button', { name: 'Collapse navigation' }).click()
    await expect.poll(width).toBe(66)
    await expect(siteTree(page)).toHaveCount(0)
    // The labels stay the links' names, shown as tooltips
    await expect(nav.getByRole('link', { name: 'Structure' })).toBeVisible()

    await page.getByRole('button', { name: 'Expand navigation' }).click()
    await expect.poll(width).toBe(236)
    await expect(siteTree(page)).toBeVisible()
  })

  test('below 960px the navigation is an off-canvas drawer with a scrim', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/studio')
    const menu = page.getByRole('button', { name: 'Open navigation' })
    await expect(menu).toBeVisible()
    await expect(navigation(page)).toBeHidden()

    await menu.click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('navigation', { name: 'Studio' })).toBeVisible()

    // The scrim beside the drawer closes it
    await page.mouse.click(370, 420)
    await expect(drawer).toBeHidden()

    // Esc closes it too, and focus returns to the menu button
    await menu.click()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(menu).toBeFocused()
  })

  test('the breadcrumbs follow the route', async ({ page }) => {
    const routes: [string, string[]][] = [
      ['/studio', ['Pulse']],
      ['/studio/site/services', ['Site', 'Services']],
      [`/studio/site/services/${LIVE.slug}`, ['Site', 'Services', LIVE.slug]],
      ['/studio/new/services', ['Site', 'Services', 'New']],
      ['/studio/layout/footer', ['Site', 'Layout', 'footer']],
      ['/studio/structure/scopes', ['Structure', 'Scopes & archetypes']],
      ['/studio/setup/environment', ['Setup', 'Environment']],
      ['/studio/media', ['Media']],
      // An old Studio path is not a route: the trail names nothing else
      ['/studio/settings', ['Not found']],
    ]
    for (const [path, trail] of routes) {
      await openStudio(page, path)
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
      await expect(breadcrumb.getByRole('listitem'), path).toHaveText(trail)
      const last = trail[trail.length - 1] ?? ''
      await expect(breadcrumb.getByText(last, { exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      // Separators are decorative
      for (const separator of await breadcrumb.locator('svg').all()) {
        await expect(separator).toHaveAttribute('aria-hidden', 'true')
      }
    }
  })

  test('the theme switch sets light, dark and system', async ({ page }) => {
    await openStudio(page)
    const theme = page.getByRole('radiogroup', { name: 'Theme' })
    for (const [label, value] of [
      ['Dark', 'dark'],
      ['Light', 'light'],
      ['System', 'system'],
    ] as const) {
      const option = theme.getByRole('radio', { name: label })
      await option.click()
      await expect(option).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-theme', value)
      expect(await page.evaluate(() => localStorage.getItem('krantho-studio-theme'))).toBe(value)
    }
  })

  test('the assistant launcher shows while the example enables the assistant', async ({ page }) => {
    await openStudio(page)
    await expect(navigation(page).getByRole('button', { name: 'Assistant' })).toBeVisible()
  })

  test('the assistant launcher is absent when the site turns the assistant off', async ({
    page,
  }) => {
    // The example runs with the assistant on: report it off, as a site that leaves it off would
    await page.route('**/api/capabilities', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { features: Record<string, string> }
      delete body.features.assistant
      await route.fulfill({ response, json: body })
    })
    await openStudio(page)
    await expect(navigation(page).getByRole('button', { name: 'Assistant' })).toHaveCount(0)
  })
})
