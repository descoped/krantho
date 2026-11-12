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

const COLLECTION = 'pages'

function page(slug: string, title: string, description: string): SeedDocument {
  return { collection: COLLECTION, slug, fields: { title, description } }
}

/** Published, then saved again: unpublished changes */
const AHEAD = page('e2e-pulse-ahead', 'Pulse ahead', 'Seeded by the Pulse spec')
/** Published, and locked by another user */
const LOCKED = page('e2e-pulse-locked', 'Pulse locked', 'Seeded by the Pulse spec')
/** Created only, with neither a meta description nor a description */
const NO_META = page('e2e-pulse-no-meta', 'Pulse no meta', '')

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    await createDocument(target, LOCKED)
    await publishDocument(target, COLLECTION, LOCKED.slug)
    await seedForeignLock(target, COLLECTION, LOCKED.slug)
    await createDocument(target, NO_META)
    await createDocument(target, AHEAD)
    await publishDocument(target, COLLECTION, AHEAD.slug)
    await saveDocument(target, {
      ...AHEAD,
      fields: { ...AHEAD.fields, description: 'Saved again' },
    })
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

// ---------------------------------------------------------------------------
// What the API says — the expected figures are computed from it, never hard-coded
// ---------------------------------------------------------------------------

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

interface Meta {
  collection: string
  slug: string
  version: number
  liveVersion: number | null
}

interface Item {
  meta: Meta
  fields: Record<string, unknown>
}

interface CollectionInfo {
  name: string
  pages: boolean
}

interface SiteConfig {
  site: { name: string; domain: string }
  cache: { pages: string; shared: string }
}

/** The site's locales as Studio reads them: Setup › Locales, else the configuration */
interface SiteLocales {
  defaultLocale: string
  supportedLocales: string[]
}

/** Every document of a collection in one locale, page by page */
async function listAll(target: Target, collection: string, locale: string): Promise<Item[]> {
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

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

interface Expected {
  site: SiteConfig
  framework: string | null
  pages: Item[]
  byCollection: Map<string, Item[]>
}

async function expected(target: Target): Promise<Expected> {
  const site = await api<SiteConfig>(target, '/api/site-config')
  const { defaultLocale } = await api<SiteLocales>(target, '/api/settings/locales')
  const { framework } = await api<{ framework: string | null }>(target, '/api/capabilities')
  const { collections } = await api<{ collections: CollectionInfo[] }>(target, '/api/collections')
  const byCollection = new Map<string, Item[]>()
  for (const collection of collections) {
    byCollection.set(collection.name, await listAll(target, collection.name, defaultLocale))
  }
  const pages = collections
    .filter((collection) => collection.pages)
    .flatMap((collection) => byCollection.get(collection.name) ?? [])
  return { site, framework, pages, byCollection }
}

const FRAMEWORKS: Record<string, string> = {
  next: 'Next.js',
  sveltekit: 'SvelteKit',
  node: 'Node.js',
}

// ---------------------------------------------------------------------------

async function openPulse(page: Page): Promise<Locator> {
  await page.goto('/studio')
  const main = page.getByRole('main')
  await expect(main.getByRole('figure', { name: 'Live pages' })).toBeVisible()
  return main
}

/** A key figure's number, read as the exact text of its number */
async function expectFigure(
  main: Locator,
  name: string,
  value: number,
  total: string,
): Promise<void> {
  const figure = main.getByRole('figure', { name, exact: true })
  await expect(figure.getByText(String(value), { exact: true })).toBeVisible()
  await expect(figure).toContainText(total)
}

function attentionAction(main: Locator, name: string): Locator {
  return main
    .getByRole('region', { name: 'Needs attention' })
    .getByRole('link', { name, exact: true })
}

test.describe('pulse', () => {
  test('the header shows the site name, domain, framework and page-cache mode, plus New page', async ({
    page,
    target,
  }) => {
    const { site, framework } = await expected(target)
    const main = await openPulse(page)
    const header = main.locator('header')
    await expect(header.getByRole('heading', { level: 1, name: site.site.name })).toBeVisible()
    await expect(header).toContainText(`Domain${site.site.domain}`)
    expect(framework).not.toBeNull()
    await expect(header).toContainText(`Framework${FRAMEWORKS[framework ?? ''] ?? ''}`)
    await expect(header).toContainText(`Page cache${site.cache.pages}`)
    const create = header.getByRole('link', { name: 'New page' })
    await expect(create).toHaveAttribute('href', '/studio/new/pages')
  })

  test('each key figure equals the count computed from the API', async ({ page, target }) => {
    const { pages } = await expected(target)
    const live = pages.filter(({ meta }) => meta.liveVersion !== null)
    const ahead = live.filter(({ meta }) => (meta.liveVersion ?? 0) < meta.version)
    const covered = pages.filter(({ fields }) => hasText(fields['meta-description']))
    const fallback = pages.filter(
      ({ fields }) => !hasText(fields['meta-description']) && hasText(fields['description']),
    )
    const missing = pages.length - covered.length - fallback.length

    const main = await openPulse(page)
    await expectFigure(main, 'Live pages', live.length, `of ${pages.length} pages`)
    await expect(main.getByRole('figure', { name: 'Live pages' })).toContainText(
      ahead.length === 0
        ? 'None with unpublished changes'
        : `${ahead.length} with unpublished changes`,
    )
    await expectFigure(main, 'Meta descriptions', covered.length, `of ${pages.length} pages set`)
    await expect(main.getByRole('figure', { name: 'Meta descriptions' })).toContainText(
      `${fallback.length} fall back to description · ${missing} missing`,
    )

    const findings = await fetch(new URL('/api/seo/findings', target.baseURL))
    const structured = main.getByRole('figure', { name: 'Valid structured data' })
    if (!findings.ok) {
      await expect(structured).toContainText('Unavailable')
      return
    }
    const summary = (await findings.json()) as {
      pages: Array<{ readers: Record<string, { errors: number }> }>
    }
    const valid = summary.pages.filter(({ readers }) =>
      Object.entries(readers).every(([reader, counts]) => reader === 'page' || counts.errors === 0),
    )
    await expectFigure(
      main,
      'Valid structured data',
      valid.length,
      `of ${summary.pages.length} live page`,
    )
  })

  test('the cached-pages figure is absent without a database page cache', async ({
    page,
    target,
  }) => {
    const { site } = await expected(target)
    expect(site.cache.shared).not.toBe('database')
    const main = await openPulse(page)
    await expect(main.getByText(/cached pages/i)).toHaveCount(0)
  })

  test('needs attention lists unpublished changes, a lock and a missing meta description, each opening its document', async ({
    page,
  }) => {
    const cases = [
      [`Review: ${AHEAD.fields['title']} has unpublished changes`, AHEAD.slug],
      [`Open: ${LOCKED.fields['title']} is being edited by ${OTHER_USER}`, LOCKED.slug],
      [`Fix: ${NO_META.fields['title']} has no meta description`, NO_META.slug],
    ] as const
    for (const [action, slug] of cases) {
      const main = await openPulse(page)
      await attentionAction(main, action).click()
      await expect(page).toHaveURL(new RegExp(`/studio/site/${COLLECTION}/${slug}$`))
    }
  })

  test('collections show their live and draft counts', async ({ page, target }) => {
    const { byCollection } = await expected(target)
    const main = await openPulse(page)
    const section = main.getByRole('region', { name: 'Collections' })
    for (const [name, items] of byCollection) {
      if (name === 'globals') continue
      const live = items.filter(({ meta }) => meta.liveVersion === meta.version).length
      const draft = items.filter(({ meta }) => meta.liveVersion === null).length
      const label = name.charAt(0).toUpperCase() + name.slice(1)
      const row = section.getByRole('link', { name: new RegExp(`^${label}\\b`) })
      await expect(row).toHaveAttribute('href', `/studio/site/${name}`)
      // The counts read "<n> live", "<n> draft ahead" (when any), "<n> draft"
      await expect(row).toContainText(new RegExp(`(?<!\\d)${live} live`))
      await expect(row).toContainText(new RegExp(`(?<!\\d)${draft} draft(?! ahead)`))
    }
    await expect(section.getByRole('link', { name: /^Globals\b/ })).toHaveCount(0)
  })

  test('recent activity shows the seeded events with their event chips', async ({ page }) => {
    const main = await openPulse(page)
    const activity = main.getByRole('region', { name: 'Recent activity' })
    const cases = [
      [AHEAD.slug, 'Draft saved'],
      [LOCKED.slug, 'Published'],
      [NO_META.slug, 'Created'],
    ] as const
    for (const [slug, event] of cases) {
      const row = activity.getByRole('listitem').filter({
        has: page.getByRole('link', { name: slug, exact: true }),
      })
      await expect(row).toContainText(event)
      await expect(row.getByRole('link', { name: slug, exact: true })).toHaveAttribute(
        'href',
        `/studio/site/${COLLECTION}/${slug}`,
      )
    }
  })
})
