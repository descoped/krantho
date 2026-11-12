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

// Data mode on the spec's own service: published as v2, then saved as v3, so
// it has a live version, a newer current one and a history to diff and restore.
// What the page emits is read from the API — the target configures its own
// archetypes, readers and language model.
const COLLECTION = 'services'
const SLUG = 'e2e-data-mode'

const DOC: SeedDocument = {
  collection: COLLECTION,
  slug: SLUG,
  fields: {
    title: 'Data mode',
    description: 'A service the Data mode spec reads its structured data from.',
    ingress: 'Data mode ingress',
  },
  body: 'Lead words.\n\n## Alpha\n\nAlpha text.',
}

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  site: 'site',
  collection: 'collection',
  route: 'URL pattern',
  document: 'document',
  computed: 'computed',
  linked: 'linked',
}

/** Search features Google has retired: never shown (§7) */
const RETIRED = ['FAQ', 'HowTo', 'Sitelinks search box']

interface ResolvedEntity {
  type: string
  id: string
  level: 'site' | 'document'
  properties: Array<{ property: string; scope: string }>
}

interface Versions {
  versions: Array<{ version: number }>
}

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

/** The nodes of an emitted graph: its `@graph`, or the one node it is */
function nodesOf(graph: unknown): Array<Record<string, unknown>> {
  if (graph === null || typeof graph !== 'object') return []
  const nested = (graph as Record<string, unknown>)['@graph']
  const nodes: unknown[] = Array.isArray(nested) ? nested : [graph]
  return nodes.filter(
    (node): node is Record<string, unknown> => node !== null && typeof node === 'object',
  )
}

/** The one entity in the list with this @id */
function entityItem(list: Locator, id: string): Locator {
  return list.locator(`li[data-entity-id="${id.replaceAll('"', '\\"')}"]`)
}

async function seoEnabled(target: Target): Promise<boolean> {
  const caps = await api<{ features: Record<string, string> }>(target, '/api/capabilities')
  return (caps.features.seo ?? 'disabled') !== 'disabled'
}

/** Seed once: create, publish, save again — a worker that restarts finds it already there */
async function seed(target: Target): Promise<void> {
  const res = await fetch(new URL(`/api/content/${COLLECTION}/${SLUG}`, target.baseURL))
  if (res.ok) return
  await createDocument(target, DOC)
  await publishDocument(target, COLLECTION, SLUG)
  await saveDocument(target, { ...DOC, fields: { ...DOC.fields, title: 'Data mode, revised' } })
}

let seeding: Promise<void> | null = null

test.beforeEach(async ({ target }) => {
  seeding ??= seed(target)
  await seeding
})

/** Open the service's editor in Data mode, from its address */
async function openData(page: Page): Promise<Locator> {
  await page.goto(`/studio/site/${COLLECTION}/${SLUG}?mode=data`)
  await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true')
  return page.getByRole('tabpanel')
}

function card(canvas: Locator, name: string): Locator {
  return canvas.getByRole('region', { name, exact: true })
}

test.describe('editor Data mode', () => {
  test('shows the search result and social previews from the draft', async ({ page, target }) => {
    test.skip(!(await seoEnabled(target)), 'SEO is off on the target')
    const canvas = await openData(page)
    const result = card(canvas, 'Search result')
    await expect(result).toContainText('Data mode, revised')
    await expect(result).toContainText(String(DOC.fields.description))
    const social = card(canvas, 'Social cards')
    await social.getByRole('textbox', { name: 'og-title' }).fill('Shared title')
    await expect(social.locator('figure').first()).toContainText('Shared title')
  })

  test('lists the page’s @graph: each entity with type, @id and scope, each value with its source', async ({
    page,
    target,
  }) => {
    test.skip(!(await seoEnabled(target)), 'SEO is off on the target')
    const emitted = await api<unknown>(target, `/api/seo/preview/${COLLECTION}/${SLUG}`)
    const { entities } = await api<{ entities: ResolvedEntity[] }>(
      target,
      `/api/seo/resolved/${COLLECTION}/${SLUG}`,
    )
    const canvas = await openData(page)
    const graph = card(canvas, 'JSON-LD graph · what this page emits')
    const list = graph.getByRole('list', { name: 'Entities' })
    // Every node the page emits is listed — those krantho adds while composing too
    for (const node of nodesOf(emitted)) {
      if (typeof node['@id'] !== 'string') continue
      const item = entityItem(list, node['@id'])
      await expect(item).toHaveCount(1)
      if (typeof node['@type'] === 'string') {
        await expect(item.getByRole('heading', { name: node['@type'] })).toBeVisible()
      }
    }
    for (const entity of entities) {
      const item = entityItem(list, entity.id)
      await expect(item.getByRole('heading', { name: entity.type })).toBeVisible()
      await expect(item).toContainText(entity.level === 'site' ? 'site' : 'page')
      for (const property of entity.properties) {
        const row = item.getByRole('row').filter({
          has: page.getByRole('rowheader', { name: new RegExp(`^${property.property}`) }),
        })
        await expect(row.first()).toContainText(SCOPE_LABELS[property.scope] ?? property.scope)
      }
    }
    await graph.getByText('What the page emits · view-source').click()
    await expect(graph.getByRole('region', { name: 'application/ld+json' })).toContainText(
      '@context',
    )
  })

  test('rich results come from the readers’ rules only, and findings are per search engine', async ({
    page,
    target,
  }) => {
    test.skip(!(await seoEnabled(target)), 'SEO is off on the target')
    const canvas = await openData(page)
    const rich = card(canvas, 'Rich results')
    const site = await api<{
      pages: Array<{
        collection: string
        slug: string
        features: Array<{ reader: string; feature: string; eligible: boolean }>
      }>
      readers: Array<{ id: string; name: string }>
    }>(target, '/api/seo/findings')
    const listed = site.pages.find((p) => p.collection === COLLECTION && p.slug === SLUG)
    for (const feature of listed?.features ?? []) {
      const row = rich.locator('li').filter({ hasText: feature.feature })
      await expect(row.first()).toContainText(feature.eligible ? 'Eligible' : 'Not eligible')
    }
    for (const retired of RETIRED) await expect(rich).not.toContainText(retired)

    const { readers } = await api<{ readers: Array<{ name: string }> }>(
      target,
      `/api/seo/findings/${COLLECTION}/${SLUG}`,
    )
    const findings = card(canvas, 'Findings per search engine')
    await expect(findings.getByRole('region', { name: 'Title and meta description' })).toBeVisible()
    await expect(findings.getByRole('region', { name: 'Schema.org' })).toBeVisible()
    for (const reader of readers) {
      await expect(findings.getByRole('region', { name: reader.name })).toBeVisible()
    }
  })

  test('enrichment says what it does, with Enrich this document or where to set up a model', async ({
    page,
    target,
  }) => {
    test.skip(!(await seoEnabled(target)), 'SEO is off on the target')
    const llm = await api<{ configured: boolean }>(target, '/api/settings/llm')
    const canvas = await openData(page)
    const enrichment = card(canvas, 'Enrichment')
    await expect(enrichment).toContainText('Fills what is missing')
    await expect(enrichment).toContainText('never overwrites')
    await expect(enrichment).toContainText('saved to the document at once')
    await expect(enrichment).toContainText('changes straight away')
    if (llm.configured) {
      await expect(enrichment.getByRole('button', { name: 'Enrich this document' })).toBeVisible()
    } else {
      await expect(enrichment.getByRole('link', { name: 'Setup › AI provider' })).toBeVisible()
    }
  })

  test('history diffs two versions and a restore creates a new version', async ({
    page,
    target,
  }) => {
    const path = `/api/content/${COLLECTION}/${SLUG}/versions`
    const before = (await api<Versions>(target, path)).versions
    const newest = before[0]?.version ?? 0
    const canvas = await openData(page)
    const history = card(canvas, 'History')
    const rows = history.getByRole('list', { name: 'Versions' }).getByRole('listitem')
    await expect(rows.first()).toContainText(`v${newest}`)
    await expect(rows.first()).toContainText('current')

    await history.getByRole('button', { name: `Diff v${newest} with the version before` }).click()
    await expect(
      history.getByRole('heading', { name: `v${newest - 1} → v${newest}` }),
    ).toBeFocused()
    await history.getByRole('button', { name: 'Split' }).click()
    await history.getByRole('button', { name: 'Close the diff' }).click()

    await history.getByRole('button', { name: `Restore v${newest - 1}` }).click()
    const dialog = page.getByRole('dialog', { name: `Restore v${newest - 1}?` })
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(rows.first()).toContainText(`v${newest + 1}`)
    const after = (await api<Versions>(target, path)).versions
    expect(after[0]?.version).toBe(newest + 1)
    expect(after).toHaveLength(before.length + 1)
  })
})
