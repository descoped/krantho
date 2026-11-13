import type { Locator, Page } from '@playwright/test'
import { expect, readPublicPage, type Target, test } from '../src/fixtures.js'

// Structure on nextjs-shadcn: its site entities (a founder Person, the
// ProfessionalService, the WebSite), the pages collection's Article and
// BreadcrumbList, services' Service. Every expected figure is computed from
// the API; a setting a test changes is put back when it ends.

interface Feature {
  reader: string
  feature: string
  type: string
  nodeId?: string
  status: string
  eligible: boolean
  missing: string[]
}

interface Findings {
  pages: Array<{
    collection: string
    slug: string
    path: string
    readers: Record<string, { errors: number }>
    features: Feature[]
  }>
  readers: Array<{ id: string; name: string }>
}

interface SeoConfigData {
  entities: Array<{
    '@type': string
    '@id'?: string
    role?: string
    properties: Record<string, unknown>
  }>
  fieldMappings?: Record<string, string>
  robotsTxt?: string
}

interface CatalogAnswer {
  types: Array<{ type: string; richResult: string | null; richResultStatus: string }>
}

/** Search features Google has retired: never shown (§7) */
const RETIRED = /\bFAQ\b|How-?to|Sitelinks search box/i

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function send(
  target: Target,
  method: 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<void> {
  const res = await fetch(new URL(path, target.baseURL), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`)
}

async function seoConfig(target: Target, id: string): Promise<SeoConfigData> {
  const answer = await api<{ config: { config: SeoConfigData } | null }>(
    target,
    `/api/seo/config/${id}`,
  )
  return answer.config?.config ?? { entities: [] }
}

/** Run `body` with a scope's SEO settings put back afterwards */
async function keeping(target: Target, id: string, body: () => Promise<void>): Promise<void> {
  const saved = await seoConfig(target, id)
  try {
    await body()
  } finally {
    await send(target, 'PUT', '/api/seo/config', { id, config: saved })
  }
}

/** The figures the intro band shows, computed as the spec reads the API */
function figures(findings: Findings): { valid: number; eligible: number; applicable: number } {
  const valid = findings.pages.filter((page) =>
    Object.entries(page.readers).every(
      ([reader, counts]) => reader === 'page' || counts.errors === 0,
    ),
  ).length
  const cards = new Map<string, Map<string, boolean>>()
  for (const page of findings.pages) {
    for (const f of page.features) {
      const key = `${f.reader}:${f.feature}`
      const pages = cards.get(key) ?? new Map<string, boolean>()
      const pageKey = `${page.collection}/${page.slug}`
      pages.set(pageKey, (pages.get(pageKey) ?? false) || f.eligible)
      cards.set(key, pages)
    }
  }
  const all = [...cards.values()]
  return {
    valid,
    eligible: all.reduce((sum, pages) => sum + [...pages.values()].filter(Boolean).length, 0),
    applicable: all.reduce((sum, pages) => sum + pages.size, 0),
  }
}

async function openStructure(page: Page, path: string): Promise<Locator> {
  await page.goto(`/studio/structure${path}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Structure' })).toBeVisible()
  return page.getByRole('tabpanel')
}

test.describe('Structure', () => {
  test('the header, intro band and figures follow §6', async ({ page, target }) => {
    const findings = await api<Findings>(target, '/api/seo/findings')
    const site = await seoConfig(target, 'site')
    const { site: identity } = await api<{ site: { name: string } }>(target, '/api/site-config')
    await openStructure(page, '')
    await expect(page).toHaveURL(/\/studio\/structure\/graph/)
    await expect(
      page.getByText(`How search engines and AI assistants read ${identity.name}.`),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Validate all pages' })).toBeVisible()
    await expect(page.getByRole('button', { name: "Fill what's missing" })).toBeVisible()
    const intro = page.getByRole('region', {
      name: 'One graph per page, assembled from four scopes',
    })
    const expected = figures(findings)
    await expect(intro).toContainText(`${expected.valid} / ${findings.pages.length}`)
    await expect(intro).toContainText(String(site.entities.length))
    await expect(intro).toContainText(`${expected.eligible} / ${expected.applicable}`)
  })

  test('Validate all pages reads every live page again', async ({ page, target }) => {
    const findings = await api<Findings>(target, '/api/seo/findings')
    const { valid } = figures(findings)
    await openStructure(page, '/graph')
    await page.getByRole('button', { name: 'Validate all pages' }).click()
    await expect(
      page.getByText(`Validated ${findings.pages.length} live pages: ${valid} with a valid graph.`),
    ).toBeVisible()
  })

  test('the old SEO screens are gone', async ({ page }) => {
    for (const old of ['/identity', '/documents', '/delivery', '/archetype/pages']) {
      await page.goto(`/studio/structure${old}`)
      await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
    }
  })
})

test.describe('Structure › Graph', () => {
  test('a page picker, the legend, and nodes with type, @id and chips, linked by their property', async ({
    page,
    target,
  }) => {
    const findings = await api<Findings>(target, '/api/seo/findings')
    const panel = await openStructure(page, '/graph?page=pages/about')
    const picker = panel.getByRole('combobox', { name: 'Page' })
    await expect(picker.getByRole('option')).toHaveCount(findings.pages.length)
    const legend = panel.getByRole('list', { name: 'Where each node comes from' })
    for (const kind of ['site', 'collection', 'document', 'derived'])
      await expect(legend).toContainText(kind)
    const canvas = panel.getByRole('region', { name: 'Graph canvas' })
    const article = canvas.getByRole('button', { name: /^Article/ })
    await expect(article).toContainText('#article')
    await expect(article).toContainText(/\d+ propert/)
    await expect(article).toContainText('Article')
    for (const label of ['publisher', 'isPartOf', 'mainEntity']) {
      await expect(canvas.locator('text').filter({ hasText: label }).first()).toBeAttached()
    }
  })

  test("a node's chips name its rich results and how many requirements they lack", async ({
    page,
    target,
  }) => {
    await keeping(target, 'site', async () => {
      const site = await seoConfig(target, 'site')
      // Without an address, Google's Local business lacks what it requires
      const entities = site.entities.map((entity) => {
        if (entity['@type'] !== 'ProfessionalService') return entity
        const { address: _address, ...properties } = entity.properties
        return { ...entity, properties }
      })
      await send(target, 'PUT', '/api/seo/config', { id: 'site', config: { ...site, entities } })
      const findings = await api<Findings>(target, '/api/seo/findings')
      const about = findings.pages.find((p) => p.collection === 'pages' && p.slug === 'about')
      const features = (about?.features ?? []).filter((f) => f.type === 'ProfessionalService')
      expect(features.length).toBeGreaterThan(0)
      const missing = new Set(features.flatMap((f) => f.missing))
      expect(missing.size).toBeGreaterThan(0)
      const panel = await openStructure(page, '/graph?page=pages/about')
      const business = panel
        .getByRole('region', { name: 'Graph canvas' })
        .getByRole('button', { name: /^ProfessionalService/ })
      for (const f of features) await expect(business).toContainText(f.feature)
      await expect(business).toContainText('not eligible')
      await expect(business).toContainText(`${missing.size} missing`)
    })
  })

  test('selecting a node shows each value with its source, and a missing requirement with Fix', async ({
    page,
    target,
  }) => {
    await keeping(target, 'site', async () => {
      const site = await seoConfig(target, 'site')
      // Without an address, Google's Local business lacks what it requires
      const entities = site.entities.map((entity) => {
        if (entity['@type'] !== 'ProfessionalService') return entity
        const { address: _address, ...properties } = entity.properties
        return { ...entity, properties }
      })
      await send(target, 'PUT', '/api/seo/config', { id: 'site', config: { ...site, entities } })
      const panel = await openStructure(page, '/graph?page=pages/about')
      await panel
        .getByRole('region', { name: 'Graph canvas' })
        .getByRole('button', { name: /^ProfessionalService/ })
        .click()
      // The type is a visually hidden part of the heading, which the name sets apart with a space
      const card = panel.getByRole('region', { name: /^Selected node\s*: ProfessionalService$/ })
      await expect(card.getByRole('list', { name: 'Missing requirements' })).toContainText(
        'Local business needs address',
      )
      await expect(card.getByRole('link', { name: 'Fix Local business' })).toHaveAttribute(
        'href',
        /\/structure\/scopes#scope-site$/,
      )
      await expect(card.getByRole('row').filter({ hasText: 'telephone' }).first()).toContainText(
        'site',
      )
    })
  })

  test('What the page emits shows the JSON-LD as served', async ({ page, target }) => {
    const served = await readPublicPage(target, '/about')
    const match = served.html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    const graph = JSON.parse(match?.[1] ?? '{}') as { '@graph'?: Array<{ '@id'?: string }> }
    const panel = await openStructure(page, '/graph?page=pages/about')
    await panel.getByText('What the page emits · view-source').click()
    const source = panel.getByRole('region', { name: 'application/ld+json · /about' })
    for (const node of graph['@graph'] ?? []) {
      if (node['@id']) await expect(source).toContainText(node['@id'])
    }
    const download = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Export JSON-LD' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.jsonld$/)
    await expect(panel.getByRole('link', { name: 'Edit or import in Data mode' })).toHaveAttribute(
      'href',
      /\/site\/pages\/about\?mode=data/,
    )
  })

  test.describe('below 1200px', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the canvas is a list', async ({ page }) => {
      const panel = await openStructure(page, '/graph?page=pages/about')
      const list = panel.getByRole('list', { name: 'Graph nodes' })
      await expect(list.getByRole('button', { name: /^Article/ })).toBeVisible()
      await expect(panel.getByRole('region', { name: 'Graph canvas' })).toHaveCount(0)
    })
  })
})

test.describe('Structure › Scopes & archetypes', () => {
  test('the four-card cascade, each card leading to the next', async ({ page }) => {
    const panel = await openStructure(page, '/scopes')
    const cascade = panel.getByRole('region', { name: 'Four scopes, the narrowest wins' })
    await expect(cascade.getByRole('listitem')).toHaveCount(4)
    await expect(cascade.getByRole('link', { name: /^Then:/ })).toHaveCount(3)
  })

  test('site identity values from config are read-only, saying where to change them', async ({
    page,
    target,
  }) => {
    const { site } = await api<{ site: { name: string } }>(target, '/api/site-config')
    const panel = await openStructure(page, '/scopes')
    const identity = panel.getByRole('region', { name: 'From krantho.config.ts' })
    await expect(identity).toContainText(site.name)
    await expect(identity).toContainText('Change it in krantho.config.ts (site.name)')
    await expect(identity.getByRole('textbox')).toHaveCount(0)
  })

  test('database site entities are editable and save', async ({ page, target }) => {
    await keeping(target, 'site', async () => {
      const panel = await openStructure(page, '/scopes')
      const entities = panel.getByRole('region', { name: 'Site entities' })
      await entities
        .getByRole('treeitem', { name: /Person/ })
        .first()
        .click()
      await entities.getByRole('textbox', { name: 'jobTitle' }).fill('Chief e2e officer')
      await entities.getByRole('button', { name: /Save/ }).click()
      await expect(
        page.getByText("Site entities saved. Every page's structured data has changed."),
      ).toBeVisible()
      const person = (await seoConfig(target, 'site')).entities.find((e) => e['@type'] === 'Person')
      expect(person?.properties.jobTitle).toBe('Chief e2e officer')
      await expect(entities.getByRole('button', { name: /Import/ })).toBeVisible()
    })
  })

  test('collection archetypes change, with the impact analysis', async ({ page, target }) => {
    await keeping(target, 'collection:services', async () => {
      const panel = await openStructure(page, '/scopes')
      await panel.getByRole('button', { name: "Change Services's archetype" }).click()
      const dialog = page.getByRole('dialog', { name: "Change Services's archetype" })
      await expect(dialog.getByRole('checkbox', { name: /^Service/ })).toBeChecked()
      await dialog.getByRole('checkbox', { name: /^Breadcrumb/ }).check()
      await expect(
        dialog.getByText(/No page of the collection would lose a value|would keep values/),
      ).toBeVisible()
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(dialog).toBeHidden()
      const types = (await seoConfig(target, 'collection:services')).entities.map((e) => e['@type'])
      expect(types).toEqual(['Service', 'BreadcrumbList'])
    })
  })

  test('the catalog shows only types with features still shown', async ({ page }) => {
    const panel = await openStructure(page, '/scopes')
    const catalog = panel.getByRole('region', { name: 'The catalog' })
    await expect(catalog).toContainText('Article')
    await expect(catalog).not.toContainText(RETIRED)
  })
})

/** What a feature's card says is missing: each property, on how many pages, with Fix */
async function expectMissing(card: Locator, findings: Findings, f: Feature): Promise<void> {
  const lines = new Map<string, number>()
  for (const p of findings.pages) {
    for (const g of p.features) {
      if (g.feature !== f.feature || g.reader !== f.reader) continue
      for (const property of g.missing) {
        const key = `${g.type}.${property}`
        lines.set(key, (lines.get(key) ?? 0) + 1)
      }
    }
  }
  if (lines.size === 0) {
    await expect(card).toContainText('Nothing is missing.')
    return
  }
  for (const [key, count] of lines) {
    await expect(card).toContainText(`${key} missing on ${count} page`)
  }
  await expect(
    card.getByRole('link', { name: new RegExp(`^Fix ${f.feature}`) }).first(),
  ).toBeVisible()
}

test.describe('Structure › Rich results', () => {
  test('one card per active feature with eligible / applicable, what is missing, Fix and the rule', async ({
    page,
    target,
  }) => {
    const findings = await api<Findings>(target, '/api/seo/findings')
    const panel = await openStructure(page, '/rich-results')
    const seen = new Set<string>()
    for (const p of findings.pages) {
      for (const f of p.features) {
        const name = findings.readers.find((r) => r.id === f.reader)?.name ?? f.reader
        if (seen.has(`${f.feature} · ${name}`)) continue
        seen.add(`${f.feature} · ${name}`)
        const applicable = findings.pages.filter((q) =>
          q.features.some((g) => g.feature === f.feature && g.reader === f.reader),
        )
        const eligible = applicable.filter((q) =>
          q.features.some((g) => g.feature === f.feature && g.reader === f.reader && g.eligible),
        )
        const card = panel.getByRole('region', { name: `${f.feature} · ${name}`, exact: true })
        await expect(card).toContainText(`${eligible.length} / ${applicable.length}`)
        await expect(card.getByRole('link', { name: new RegExp(`${name}'s rule`) })).toBeVisible()
        await expectMissing(card, findings, f)
      }
    }
    // Then each feature Google's rules still show that no page uses yet
    const catalog = await api<CatalogAnswer>(target, '/api/seo/catalog')
    const unused = new Set(
      catalog.types
        .filter((t) => t.richResult && ['active', 'restricted'].includes(t.richResultStatus))
        .map((t) => `${t.richResult} · Google`)
        .filter((key) => !seen.has(key)),
    )
    for (const key of unused) {
      await expect(panel.getByRole('region', { name: key, exact: true })).toContainText(
        'No page of this site is of this type yet',
      )
    }
    await expect(panel.locator('.structure-rich-card')).toHaveCount(seen.size + unused.size)
  })

  test('no retired feature appears anywhere', async ({ page }) => {
    for (const tab of ['/graph', '/scopes', '/rich-results', '/crawlers']) {
      const panel = await openStructure(page, tab)
      await expect(panel).not.toContainText(RETIRED)
    }
  })
})

test.describe('Structure › Crawlers & assistants', () => {
  test('the sitemap as served', async ({ page, target }) => {
    const sitemap = await readPublicPage(target, '/sitemap.xml')
    const urls = sitemap.html.match(/<loc>/g)?.length ?? 0
    const panel = await openStructure(page, '/crawlers')
    const card = panel.getByRole('region', { name: 'Sitemap' })
    await expect(card).toContainText(`As the site serves it at /sitemap.xml: ${urls} URL`)
  })

  test('the robots.txt override with Save and Reset', async ({ page, target }) => {
    const panel = await openStructure(page, '/crawlers')
    const card = panel.getByRole('region', { name: 'robots.txt' })
    const field = card.getByRole('textbox', { name: 'robots.txt' })
    await field.fill('User-agent: *\nDisallow: /e2e-private')
    await card.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Override saved. /api/seo/robots.txt now serves it.')).toBeVisible()
    expect((await readPublicPage(target, '/robots.txt')).html).toContain('Disallow: /e2e-private')
    // Kept beside the site entities, never among them, so no page's graph states it
    const site = await seoConfig(target, 'site')
    expect(site.robotsTxt).toContain('Disallow: /e2e-private')
    expect(JSON.stringify(site.entities)).not.toContain('e2e-private')
    expect(JSON.stringify(await api(target, '/api/seo/preview/pages/about'))).not.toContain(
      'e2e-private',
    )
    await card.getByRole('button', { name: 'Reset' }).click()
    await expect(
      page.getByText('Override removed. krantho generates robots.txt again.'),
    ).toBeVisible()
    expect((await readPublicPage(target, '/robots.txt')).html).not.toContain('e2e-private')
  })

  test('llms.txt read-only, with its origin', async ({ page, target }) => {
    const served = await readPublicPage(target, '/llms.txt')
    const krantho = await readPublicPage(target, '/api/seo/llms.txt')
    const panel = await openStructure(page, '/crawlers')
    const card = panel.getByRole('region', { name: 'llms.txt', exact: true })
    if (served.status !== 200) {
      await expect(card).toContainText('/llms.txt')
      return
    }
    await expect(card.getByLabel('llms.txt as served')).toContainText(
      served.html.split('\n')[0] ?? '',
    )
    await expect(card.getByRole('textbox')).toHaveCount(0)
    const ours = served.html.trimEnd() === krantho.html.trimEnd()
    await expect(card).toContainText(
      ours ? "Served from krantho's API" : "Written by the site's own /llms.txt route",
    )
  })
})

test.describe("Structure › Fill what's missing", () => {
  test("a collection scope enriches only that collection's documents (#296)", async ({
    page,
    target,
  }) => {
    // A model that never answers: the job runs over its documents and fills nothing
    await send(target, 'PUT', '/api/settings/llm', {
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:9',
      use: true,
    })
    try {
      await openStructure(page, '/graph')
      await page.getByRole('button', { name: "Fill what's missing" }).click()
      const dialog = page.getByRole('dialog', { name: "Fill what's missing" })
      await expect(dialog).toContainText('never overwrites')
      await dialog.getByRole('combobox', { name: 'Scope' }).selectOption('services')
      await dialog.getByRole('button', { name: "Fill what's missing" }).click()
      await expect(dialog.getByRole('status')).toContainText('Finished.', { timeout: 60_000 })
      // Each step's job, the meta descriptions' too, went over the services only
      const reports = dialog.locator('.fill-run-reports > li')
      await expect(reports).toHaveCount(2)
      for (const [index, label] of ['Meta description', 'Schema.org properties'].entries()) {
        const report = reports.nth(index)
        await expect(report).toContainText(label)
        await report.getByText('Each document').click()
        const items = await report.locator('.fill-run-items code').allTextContents()
        expect(items.length).toBeGreaterThan(0)
        for (const item of items) expect(item.trim()).toMatch(/^services\//)
      }
      const status = await api<{ items: Array<{ collection: string }> }>(
        target,
        '/api/seo/enrich/status',
      )
      expect(status.items.length).toBeGreaterThan(0)
      expect(new Set(status.items.map((item) => item.collection))).toEqual(new Set(['services']))
    } finally {
      await send(target, 'DELETE', '/api/settings/llm?provider=ollama')
    }
  })
})
