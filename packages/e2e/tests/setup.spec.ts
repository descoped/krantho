import AxeBuilder from '@axe-core/playwright'
import { PROVIDER_PRESETS } from '@krantho/ai'
import type { Locator, Page } from '@playwright/test'
import { createDocument, dropDelivery, expect, seedFailedDelivery, test } from '../src/fixtures.js'
import { TARGETS } from '../src/targets.js'
import { startTokenServer, type TokenServer } from '../src/token-server.js'

// Setup on nextjs-shadcn: how the site is configured, a tab per area. Every
// expected value is read from the API; a setting a test changes is put back.
// People needs signed-in admins, so its tests run against a second server of
// the same build with token sign-in (`src/token-server.ts`).

async function api<T>(base: string, path: string): Promise<T> {
  const res = await fetch(new URL(path, base))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function send(base: string, method: string, path: string, body?: unknown): Promise<void> {
  const res = await fetch(new URL(path, base), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`)
}

async function openTab(page: Page, tab: string): Promise<Locator> {
  await page.goto(`/studio/setup/${tab}`)
  return page.getByRole('tabpanel')
}

function row(scope: Locator, name: string | RegExp): Locator {
  return scope.getByRole('row').filter({ has: scope.page().getByRole('rowheader', { name }) })
}

test.describe('Setup', () => {
  test('opens its first tab, and every tab says where its values come from', async ({ page }) => {
    await page.goto('/studio/setup')
    await expect(page).toHaveURL(/\/studio\/setup\/collections$/)
    const tabs = page.getByRole('tablist', { name: 'Setup' }).getByRole('tab')
    const labels = [
      'Collections & schema',
      'Locales',
      'AI provider',
      'Integrations',
      'Checkpoints',
      'Environment',
    ]
    await expect(tabs).toHaveText(labels)
    for (const label of labels) {
      await tabs.filter({ hasText: label }).click()
      const panel = page.getByRole('tabpanel')
      await expect(panel.locator('.setup-source').first()).toBeVisible()
      await expect(panel.locator('.setup-source .ui-chip').first()).toHaveText(
        /Configuration|Database|Server/,
      )
    }
  })

  test('the old Settings, Checkpoints, Webhooks, Translations, Users and schema pages are gone', async ({
    page,
  }) => {
    for (const path of [
      'settings',
      'checkpoints',
      'webhooks',
      'translations',
      'users',
      'schema/pages',
      'setup/collections/pages',
    ]) {
      await page.goto(`/studio/${path}`)
      await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
    }
  })
})

test.describe('Setup › Collections & schema', () => {
  const FIELD = 'e2eteaser'

  test('lists each collection with where it renders and its archetype', async ({
    page,
    target,
  }) => {
    const answer = await api<{
      config: { config: { entities: Array<{ '@type': string }> } } | null
    }>(target.baseURL, '/api/seo/config/collection:pages')
    const panel = await openTab(page, 'collections')
    const pages = row(panel.getByRole('table', { name: 'Collections' }), /^Pages/)
    await expect(pages).toContainText('/:slug')
    for (const entity of answer.config?.config.entities ?? []) {
      await expect(pages).toContainText(entity['@type'])
    }
  })

  test('locks code fields with the hint; adds, edits and deletes a runtime field; exports Zod', async ({
    page,
    target,
  }) => {
    const panel = await openTab(page, 'collections')
    await panel.getByRole('button', { name: 'Fields of Pages' }).click()
    const fields = panel.getByRole('table', { name: 'Fields of Pages' })
    await expect(row(fields, /^title/)).toContainText(
      'Defined in code, change it in krantho.collections.ts; code always wins',
    )
    await panel.getByRole('button', { name: 'Add runtime field' }).click()
    const add = page.getByRole('dialog', { name: 'Add a runtime field to Pages' })
    await add.getByLabel('Name').fill(FIELD)
    await add.getByLabel('Type').selectOption('textarea')
    await add.getByRole('button', { name: 'Save field' }).click()
    await expect(row(fields, new RegExp(`^${FIELD}`))).toContainText('Runtime')

    await panel.getByRole('button', { name: `Edit ${FIELD}` }).click()
    const edit = page.getByRole('dialog', { name: `Edit ${FIELD}` })
    await edit.getByLabel('Required').check()
    await edit.getByRole('button', { name: 'Save field' }).click()
    await expect(edit).toBeHidden()
    const runtime = await api<{ fields: Array<{ name: string; required: boolean }> }>(
      target.baseURL,
      '/api/schema/pages/runtime',
    )
    expect(runtime.fields.find((f) => f.name === FIELD)?.required).toBe(true)

    await panel.getByRole('button', { name: 'Export as Zod' }).click()
    const zod = page.getByRole('dialog', { name: 'Pages as Zod' })
    await expect(zod.getByRole('region', { name: 'Zod schema' })).toContainText(FIELD)
    await zod.getByRole('button', { name: 'Close' }).click()

    await panel.getByRole('button', { name: `Delete ${FIELD}` }).click()
    await page
      .getByRole('dialog', { name: `Delete the field ${FIELD}?` })
      .getByRole('button', { name: 'Delete field' })
      .click()
    await expect(row(fields, new RegExp(`^${FIELD}`))).toHaveCount(0)
  })
})

interface Locales {
  defaultLocale: string
  configuredLocales: string[]
  supportedLocales: string[]
}

test.describe('Setup › Locales', () => {
  test('removes and adds back a configured locale through /api/settings/locales, never the default', async ({
    page,
    target,
  }) => {
    const before = await api<Locales>(target.baseURL, '/api/settings/locales')
    const other = before.supportedLocales.find((locale) => locale !== before.defaultLocale)
    test.skip(other === undefined, 'the site has one locale')
    if (other === undefined) return
    try {
      const panel = await openTab(page, 'locales')
      const table = panel.getByRole('table', { name: 'Locales' })
      await expect(row(table, before.defaultLocale)).toContainText('Default')
      await expect(panel.getByRole('button', { name: /as default/ })).toHaveCount(0)
      await expect(
        panel.getByRole('button', { name: `Remove ${before.defaultLocale}` }),
      ).toHaveCount(0)
      await panel.getByRole('button', { name: `Remove ${other}` }).click()
      const confirm = page.getByRole('dialog', { name: `Remove the locale ${other}?` })
      await expect(confirm).toContainText('kept, not deleted')
      await confirm.getByRole('button', { name: 'Remove locale' }).click()
      await expect(row(table, other)).toHaveCount(0)
      await panel.getByLabel('Configured locale').selectOption(other)
      await panel.getByRole('button', { name: 'Add locale' }).click()
      await expect(row(table, other)).toBeVisible()
      const after = await api<Locales>(target.baseURL, '/api/settings/locales')
      expect(after.defaultLocale).toBe(before.defaultLocale)
      expect([...after.supportedLocales].sort()).toEqual([...before.supportedLocales].sort())
    } finally {
      await send(target.baseURL, 'PUT', '/api/settings/locales', {
        supportedLocales: before.supportedLocales,
      })
    }
  })

  test('the coverage table creates a missing locale version as a draft', async ({
    page,
    target,
  }) => {
    const locales = await api<Locales>(target.baseURL, '/api/settings/locales')
    const other = locales.supportedLocales.find((l) => l !== locales.defaultLocale)
    test.skip(!other, 'the site has one locale')
    const slug = `setup-coverage-${Date.now()}`
    await createDocument(target, {
      collection: 'services',
      slug,
      fields: { title: 'Coverage', description: 'A coverage check', ingress: 'Coverage' },
    })
    const panel = await openTab(page, 'locales')
    const coverage = panel.getByRole('region', { name: 'Translation coverage' })
    const table = coverage.getByRole('table', { name: 'Services: versions per locale' })
    await table.getByRole('button', { name: `Create the ${other} draft of ${slug}` }).click()
    await expect(table.getByRole('link', { name: `Open the ${other} draft` })).toBeVisible()
    const created = await api<{ meta: { locale: string; liveVersion: number | null } }>(
      target.baseURL,
      `/api/content/services/${slug}?locale=${other}`,
    )
    expect(created.meta).toMatchObject({ locale: other, liveVersion: null })
  })
})

test.describe('Setup › AI provider', () => {
  test.afterEach(async ({ target }) => {
    await send(target.baseURL, 'DELETE', '/api/settings/llm?provider=ollama')
  })

  test('lists the providers of @krantho/ai; a local model is turned on from its address and Test reports the failure', async ({
    page,
    target,
  }) => {
    const panel = await openTab(page, 'ai')
    await expect(panel.getByRole('status').first()).toContainText(/^AI help is /)
    const before = await api<{ providers: Array<{ provider: string }> }>(
      target.baseURL,
      '/api/settings/llm',
    )
    expect(before.providers.map((entry) => entry.provider)).toEqual(Object.keys(PROVIDER_PRESETS))

    await panel.getByText('For developers').click()
    const local = panel.getByRole('heading', { name: 'Ollama' }).locator('xpath=ancestor::li')
    // A port nothing listens on: Test must report the failure the model call met
    await local.getByLabel('Address', { exact: true }).fill('http://127.0.0.1:9')
    await local.getByRole('button', { name: 'Turn on' }).click()
    await expect(
      page
        .getByText('The site now uses Ollama.')
        .or(page.getByText(/^Saved the settings for Ollama/)),
    ).toBeVisible()
    const saved = await api<{ providers: Array<{ provider: string; ready: boolean }> }>(
      target.baseURL,
      '/api/settings/llm',
    )
    expect(saved.providers.find((entry) => entry.provider === 'ollama')).toMatchObject({
      ready: true,
    })
    const ready = panel.getByRole('heading', { name: 'Ollama' }).locator('xpath=ancestor::li')
    await ready.getByRole('button', { name: 'Test' }).click()
    await expect(page.getByText(/^Ollama did not answer/)).toBeVisible()
  })

  test('Run across the site: Meta only runs; Force regenerate asks first, saying what it overwrites', async ({
    page,
    target,
  }) => {
    await send(target.baseURL, 'PUT', '/api/settings/llm', {
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:9',
      use: true,
    })
    const panel = await openTab(page, 'ai')
    const run = panel.getByRole('region', { name: 'Run across the site' })
    await run.getByLabel('Scope').selectOption('services')
    await run.getByRole('button', { name: 'Meta only' }).click()
    await expect(run.getByRole('status')).toContainText(/^Finished\. Meta description:/, {
      timeout: 60_000,
    })
    await run.getByRole('button', { name: 'Force regenerate…' }).click()
    const confirm = page.getByRole('dialog', { name: 'Force regenerate SEO for Services?' })
    await expect(confirm).toContainText(
      "overwrites the values there now, the editors' own included",
    )
    await expect(confirm).toContainText('this is not a draft')
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await confirm.getByRole('button', { name: 'Overwrite and regenerate' }).click()
    await expect(run.getByRole('status')).toContainText(
      /^Finished\. Meta description: .*Schema\.org properties:/,
      {
        timeout: 60_000,
      },
    )
  })
})

test.describe('Setup › Integrations', () => {
  test('an empty log shows its empty state', async ({ page }) => {
    const panel = await openTab(page, 'integrations')
    await expect(panel.getByText('No webhook deliveries')).toBeVisible()
  })

  test('filters by state, and Retry on a failed delivery answers with the API', async ({
    page,
    target,
  }) => {
    const id = seedFailedDelivery(target, 'https://hooks.e2e.local/publish')
    try {
      const panel = await openTab(page, 'integrations')
      await panel.getByRole('button', { name: 'Failed' }).click()
      const table = panel.getByRole('table', { name: 'Webhook deliveries' })
      await expect(table.getByRole('row')).toHaveCount(2)
      await panel.getByRole('button', { name: 'Delivered' }).click()
      await expect(panel.getByText('No delivery has reached its webhook yet.')).toBeVisible()
      await panel.getByRole('button', { name: 'Failed' }).click()
      // The example configures no webhooks, so the endpoint refuses: nothing to send it to
      await table.getByRole('button', { name: `Retry delivery ${id} of publish` }).click()
      await expect(page.getByText('No configured webhook has this URL any more')).toBeVisible()
      await expect(table.getByText('Failed')).toBeVisible()
    } finally {
      dropDelivery(target, id)
    }
  })
})

test.describe('Setup › Checkpoints', () => {
  test('creates a checkpoint, and restores it behind the confirmation', async ({
    page,
    target,
  }) => {
    const name = `e2e ${Date.now()}`
    const panel = await openTab(page, 'checkpoints')
    await expect(panel).toContainText('not its size')
    await panel.getByLabel('Name').fill(name)
    await panel.getByRole('button', { name: 'Create checkpoint' }).click()
    const table = panel.getByRole('table', { name: 'Checkpoints, newest first' })
    const created = row(table, new RegExp(name))
    await expect(created).toBeVisible()
    await created.getByRole('button', { name: /^Restore/ }).click()
    const confirm = page.getByRole('dialog', { name: /^Restore v\d+ · e2e/ })
    await expect(confirm).toContainText('A safety checkpoint')
    await expect(confirm).toContainText('Every cached page is marked stale')
    await confirm.getByRole('button', { name: 'Restore checkpoint' }).click()
    await expect(page.getByText(/^Restored v\d+/)).toBeVisible()
    const { checkpoints } = await api<{ checkpoints: Array<{ trigger: string; name: string }> }>(
      target.baseURL,
      '/api/checkpoints',
    )
    expect(checkpoints[0]?.trigger).toBe('pre-restore')
  })
})

test.describe('Setup › Environment', () => {
  test('shows what /api/capabilities reports', async ({ page, target }) => {
    const caps = await api<{ persistence: string; authMode: string }>(
      target.baseURL,
      '/api/capabilities',
    )
    const panel = await openTab(page, 'environment')
    const table = panel.getByRole('table', { name: 'What the server reports' })
    await expect(row(table, 'Persistence')).toContainText(caps.persistence)
    await expect(row(table, 'Auth')).toContainText(caps.authMode)
    await expect(panel).toContainText('What the running server reports')
  })
})

test.describe('Setup › People, for an admin under token sign-in', () => {
  let server: TokenServer

  test.beforeAll(async ({ playwright: _playwright }, info) => {
    const target = TARGETS.find((t) => t.name === info.project.name)
    if (!target) throw new Error(`No target ${info.project.name}`)
    const port = Number(new URL(String(info.project.use.baseURL)).port) + 50
    server = await startTokenServer(target, port)
  })

  test.afterAll(async () => {
    await server.stop()
  })

  test('creates a user, changes a role and deactivates the account', async ({ page }) => {
    await page.goto(`${server.baseURL}/studio/setup/people`)
    await page.getByLabel('Access Token').fill(server.token)
    await page.getByRole('button', { name: 'Sign In' }).click()
    const panel = page.getByRole('tabpanel')
    await panel.getByRole('button', { name: 'Create user' }).click()
    const create = page.getByRole('dialog', { name: 'Create user' })
    await create.getByLabel('Email').fill('vera@e2e.local')
    await create.getByLabel('Name').fill('Vera')
    await create.getByLabel('Role').selectOption('viewer')
    await create.getByRole('button', { name: 'Create user' }).click()
    const table = panel.getByRole('table', { name: 'People' })
    await expect(row(table, 'Vera')).toContainText('Viewer')
    await panel.getByRole('button', { name: 'Edit Vera' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit Vera' })
    await edit.getByLabel('Role').selectOption('editor')
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(row(table, 'Vera')).toContainText('Editor')
    await panel.getByRole('button', { name: 'Deactivate Vera' }).click()
    await page
      .getByRole('dialog', { name: 'Deactivate Vera?' })
      .getByRole('button', { name: 'Deactivate' })
      .click()
    await expect(row(table, 'Vera')).toContainText('Deactivated')
  })
})

/** Studio's own theme key, set before the page loads */
const THEME_KEY = 'krantho-studio-theme'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test.describe(`Setup in the ${theme} theme at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('reads clearly and fits the width', async ({ page }) => {
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
          THEME_KEY,
          theme,
        ] as const)
        for (const tab of ['collections', 'locales', 'ai', 'checkpoints']) {
          const panel = await openTab(page, tab)
          await expect(panel.locator('.setup-section').first()).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, tab).toBeLessThanOrEqual(0)
          const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
          const violations = results.violations.flatMap((v) =>
            v.nodes.map((node) => `${tab} ${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
          )
          expect(violations).toEqual([])
        }
      })
    })
  }
}
