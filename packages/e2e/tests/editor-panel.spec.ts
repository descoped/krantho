import type { Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  publishDocument,
  type SeedDocument,
  type Target,
  test,
} from '../src/fixtures.js'

// The editor's side panel on the spec's own documents. Services render at
// /services/<slug>. Limits, statuses, sections and locales are read from the API —
// earlier specs change other documents, and a target configures its own limits.
const COLLECTION = 'services'

const BODY = [
  'Lead words for the panel.',
  '',
  '## Alpha',
  '',
  'Alpha has four words.',
  '',
  '## Beta',
  '',
  'Beta text.',
].join('\n')

function seedService(slug: string, title: string, description: string): SeedDocument {
  return {
    collection: COLLECTION,
    slug,
    fields: { title, description, ingress: `${title} ingress` },
    body: BODY,
  }
}

/** A description well under any target, and one well over it */
const SHORT = seedService('e2e-panel-short', 'Panel short', 'A short description.')
const LONG = seedService(
  'e2e-panel-long',
  'Panel long',
  `A description written long on purpose. ${'It keeps going past what a result shows. '.repeat(8)}`,
)

interface Limits {
  metaDescription: { minChars: number; maxChars: number }
  title: { maxChars: number }
}

interface CollectionInfo {
  name: string
  pages: boolean
  sections: string[]
}

interface SiteLocales {
  defaultLocale: string
  supportedLocales: string[]
}

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function exists(target: Target, collection: string, slug: string): Promise<boolean> {
  const res = await fetch(new URL(`/api/content/${collection}/${slug}`, target.baseURL))
  return res.ok
}

/** Create and publish a document once — a worker that restarts finds it already there */
async function seedLive(target: Target, doc: SeedDocument): Promise<void> {
  if (await exists(target, doc.collection, doc.slug)) return
  await createDocument(target, doc)
  await publishDocument(target, doc.collection, doc.slug)
}

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    for (const doc of [SHORT, LONG]) await seedLive(target, doc)
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  await seed(target)
})

async function limits(target: Target): Promise<Limits> {
  return (await api<{ seo: { limits: Limits } }>(target, '/api/site-config')).seo.limits
}

async function collections(target: Target): Promise<CollectionInfo[]> {
  return (await api<{ collections: CollectionInfo[] }>(target, '/api/collections')).collections
}

async function seoEnabled(target: Target): Promise<boolean> {
  const caps = await api<{ features: Record<string, string> }>(target, '/api/capabilities')
  return (caps.features.seo ?? 'disabled') !== 'disabled'
}

function metaState(length: number, { minChars, maxChars }: Limits['metaDescription']): string {
  if (length < minChars) return 'under'
  return length > maxChars ? 'over' : 'within'
}

/** Open a document's editor in Structure mode, where the body is typed in; resolves to its side panel */
async function openPanel(page: Page, collection: string, slug: string): Promise<Locator> {
  await page.goto(`/studio/site/${collection}/${slug}?mode=structure`)
  const panel = page.getByRole('complementary', { name: 'Side panel' })
  await expect(panel).toBeVisible()
  return panel
}

function panelTitle(panel: Locator): Locator {
  return panel.getByRole('heading', { level: 2 })
}

/** Put the body's caret at a place and let it report, as a key press would */
async function caretAt(page: Page, position: number): Promise<void> {
  await page.getByRole('textbox', { name: 'Body' }).evaluate((element, at) => {
    const area = element as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(at, at)
    area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
  }, position)
}

/** A string or number for each required field of a collection's schema; null when one needs more */
async function requiredFields(
  target: Target,
  collection: string,
): Promise<Record<string, unknown> | null> {
  const { schema } = await api<{
    schema: {
      properties?:
        | Record<string, { type?: string | undefined; enum?: unknown[] | undefined }>
        | undefined
      required?: string[] | undefined
    }
  }>(target, `/api/schema/${collection}`)
  const fields: Record<string, unknown> = {}
  for (const name of schema.required ?? []) {
    const property = schema.properties?.[name]
    if (property?.enum) fields[name] = property.enum[0]
    else if (property?.type === 'string') fields[name] = `E2E ${name}`
    else if (property?.type === 'number' || property?.type === 'integer') fields[name] = 1
    else return null
  }
  return fields
}

test.describe('editor side panel, nothing selected', () => {
  test('Page & sections shows N / M designed, the designed sections present or missing, and prose', async ({
    page,
    target,
  }) => {
    const designed = (await collections(target)).find((c) => c.name === COLLECTION)?.sections ?? []
    const lower = designed.map((name) => name.toLowerCase())
    const headings = ['Alpha', 'Beta']
    const present = headings.filter((h) => lower.includes(h.toLowerCase())).length
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    const card = panel.getByRole('region', { name: 'Page & sections' })
    await expect(card).toContainText(`${present} / ${designed.length} designed`)
    const rows = card.getByRole('list', { name: 'Sections' })
    await expect(rows.getByRole('button', { name: /^Lead/ })).toContainText('before first ##')
    for (const heading of headings.filter((h) => !lower.includes(h.toLowerCase()))) {
      await expect(rows.getByRole('button', { name: new RegExp(`^${heading}`) })).toContainText(
        'prose',
      )
    }
    for (const name of designed.filter(
      (n) => !headings.some((h) => h.toLowerCase() === n.toLowerCase()),
    )) {
      await expect(rows.getByRole('button', { name: `${name} Add section` })).toBeVisible()
    }
  })

  test('clicking a missing designed section adds it to the body and selects it', async ({
    page,
    target,
  }) => {
    const contract = (await collections(target)).find((c) => c.pages && c.sections.length > 0)
    test.skip(!contract, 'no collection of the target designs sections')
    if (!contract) return
    const fields = await requiredFields(target, contract.name)
    test.skip(fields === null, `${contract.name} requires a field the spec cannot fill`)
    if (fields === null) return
    const slug = `e2e-panel-contract-${Date.now().toString(36)}`
    await createDocument(target, { collection: contract.name, slug, fields, body: 'Lead only.' })
    const [first] = contract.sections
    if (first === undefined) return

    const panel = await openPanel(page, contract.name, slug)
    const card = panel.getByRole('region', { name: 'Page & sections' })
    await expect(card).toContainText(`0 / ${contract.sections.length} designed`)
    await card.getByRole('button', { name: `${first} Add section` }).click()
    await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue(new RegExp(`## ${first}`))
    await expect(panelTitle(panel)).toHaveText(`Section · ${first}`)
    await expect(panelTitle(panel)).toBeFocused()
  })

  test('Search and sharing measures against the configured limits, with advice', async ({
    page,
    target,
  }) => {
    const { metaDescription, title } = await limits(target)
    const seo = await seoEnabled(target)
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    const card = panel.getByRole('region', { name: 'Search and sharing' })
    if (!seo) {
      // Without SEO there is nothing to measure: no block, no meters, no warning
      await expect(card).toHaveCount(0)
      await expect(panel).not.toContainText('SEO is off')
      return
    }

    const description = String(SHORT.fields.description)
    const meta = card.locator('.side-length').filter({ hasText: 'Meta description' })
    await expect(meta).toHaveAttribute(
      'data-length-state',
      metaState(description.length, metaDescription),
    )
    await expect(meta).toContainText(
      `${description.length} chars · target ${metaDescription.minChars}–${metaDescription.maxChars}`,
    )
    const heading = String(SHORT.fields.title)
    await expect(card.locator('.side-length').filter({ hasText: 'Title' })).toContainText(
      `${heading.length} chars · limit ${title.maxChars}`,
    )
    await expect(card).toContainText('Social image')
    await expect(card).toContainText('Search results show the description')
  })

  test('a meta description over the limit is danger, with advice whose Edit focuses the field', async ({
    page,
    target,
  }) => {
    test.skip(!(await seoEnabled(target)), 'the target has SEO off: no meters or advice')
    const { metaDescription } = await limits(target)
    const description = String(LONG.fields.description)
    expect(description.length).toBeGreaterThan(metaDescription.maxChars)
    const panel = await openPanel(page, COLLECTION, LONG.slug)
    const card = panel.getByRole('region', { name: 'Search and sharing' })
    const meta = card.locator('.side-length').filter({ hasText: 'Meta description' })
    await expect(meta).toHaveAttribute('data-length-state', 'over')
    await expect(card).toContainText(
      `The meta description is ${description.length} characters; search results cut it near ${metaDescription.maxChars}.`,
    )
    await card.getByRole('button', { name: 'Edit description' }).click()
    await expect(page.getByRole('textbox', { name: 'description', exact: true })).toBeFocused()
    await expect(panelTitle(panel)).toHaveText('Field · description')
  })

  test('Reach shows each locale with its status, Create draft for a missing one, and what publishing refreshes', async ({
    page,
    target,
  }) => {
    const { supportedLocales } = await api<SiteLocales>(target, '/api/settings/locales')
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    const card = panel.getByRole('region', { name: 'Reach' })
    const list = card.getByRole('list', { name: 'Locales' })
    for (const locale of supportedLocales) {
      const res = await fetch(
        new URL(`/api/content/${COLLECTION}/${SHORT.slug}?locale=${locale}`, target.baseURL),
      )
      const own =
        res.ok && ((await res.json()) as { meta: { locale: string } }).meta.locale === locale
      const row = list.locator(`[data-locale="${locale}"]`)
      if (own) await expect(row).not.toContainText('Missing')
      else
        await expect(
          row.getByRole('button', { name: `Create draft in ${locale.toUpperCase()}` }),
        ).toBeVisible()
    }
    const impact = await api<{ paths: string[] }>(
      target,
      `/api/content/${COLLECTION}/${SHORT.slug}/publish-impact`,
    )
    await expect(card).toContainText('Publishing refreshes')
    for (const path of impact.paths) await expect(card).toContainText(path)
  })
})

test.describe('editor side panel, a selection', () => {
  test('selecting a field shows its type, required, the SEO outputs that read it and its length meter', async ({
    page,
    target,
  }) => {
    const { title } = await limits(target)
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    await page.getByRole('textbox', { name: 'title', exact: true }).click()
    await expect(panelTitle(panel)).toHaveText('Field · title')
    await expect(panel).toContainText('Typetext')
    await expect(panel).toContainText('RequiredYes')
    const meter = `${String(SHORT.fields.title).length} chars · limit ${title.maxChars}`
    if (await seoEnabled(target)) {
      await expect(panel).toContainText('Read bytitle')
      await expect(panel).toContainText(meter)
    } else {
      await expect(panel).not.toContainText(meter)
    }

    await panel.getByRole('button', { name: 'Page overview' }).click()
    await expect(panelTitle(panel)).toHaveText('Page overview')
    await expect(panelTitle(panel)).toBeFocused()
  })

  test('selecting a section shows designed or prose, its key, word count and only schema-declared section metadata', async ({
    page,
    target,
  }) => {
    const designed = (await collections(target)).find((c) => c.name === COLLECTION)?.sections ?? []
    const isDesigned = designed.some((name) => name.toLowerCase() === 'alpha')
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    await caretAt(page, BODY.indexOf('four'))
    await expect(panelTitle(panel)).toHaveText('Section · Alpha')
    await expect(panel).toContainText(isDesigned ? 'designed' : 'prose')
    await expect(panel).toContainText('Keysections["Alpha"]')
    await expect(panel).toContainText('Words4')
    const { schema } = await api<{ schema: { properties?: Record<string, unknown> } }>(
      target,
      `/api/schema/${COLLECTION}`,
    )
    await expect(panel.getByRole('textbox', { name: 'meta-description-Alpha' })).toHaveCount(
      Object.hasOwn(schema.properties ?? {}, 'meta-description-Alpha') ? 1 : 0,
    )
  })

  test('selecting the lead shows "before first ##"', async ({ page }) => {
    const panel = await openPanel(page, COLLECTION, SHORT.slug)
    await caretAt(page, 1)
    await expect(panelTitle(panel)).toHaveText('Lead')
    await expect(panel).toContainText('before first ##')
    await expect(panel).toContainText('Words5')
  })
})
