import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SeoConfigData } from '../src/lib/api.js'
import { clearFill } from '../src/structure/fill-job.js'
import { SETTINGS_UNREAD } from '../src/structure/scopes-model.js'
import { type FakeOptions, installApi, renderAt, settled } from './fixtures/site-api.js'
import {
  type FillGate,
  fillRoutes,
  type StructureOptions,
  structureRoutes,
} from './fixtures/structure-api.js'
import { CONFIGS } from './fixtures/structure-data.js'
import { LLMS } from './fixtures/structure-pages.js'

beforeAll(async () => {
  await Promise.all([
    import('../src/structure/structure-page.js'),
    import('../src/shell/app-shell.js'),
    import('../src/components/jsonld-graph/GraphBrowser.js'),
  ])
}, 60_000)

afterEach(() => {
  vi.unstubAllGlobals()
  // A fill outlives every screen; put the last one's outcome away between tests
  clearFill()
})

type Sent = Array<{ key: string; body: unknown }>

interface Open extends StructureOptions {
  role?: FakeOptions['role']
  /** Holds every enrichment job running until released */
  gate?: FillGate | undefined
}

function openStructure(path: string, options: Open = {}): Sent {
  const sent: Sent = []
  installApi({
    role: options.role,
    routes: { ...structureRoutes(options, sent), ...fillRoutes(sent, options.gate) },
  })
  renderAt(path)
  return sent
}

const putBodies = (sent: Sent): unknown[] =>
  sent.filter((entry) => entry.key === 'PUT /api/seo/config').map((entry) => entry.body)

describe('Structure › Scopes & archetypes', () => {
  it('shows the four scopes as a cascade, each card leading to the next', async () => {
    openStructure('/structure/scopes')
    const cascade = await screen.findByRole('region', { name: 'Four scopes, the narrowest wins' })
    const steps = within(cascade).getAllByRole('listitem')
    expect(
      steps.map((step) => step.querySelector('.structure-cascade-title')?.textContent),
    ).toEqual(['Site', 'Collection', 'URL pattern', 'Document'])
    expect(steps[0]).toHaveTextContent('Who the site is')
    expect(steps[1]).toHaveTextContent('What kind of page')
    expect(steps[2]).toHaveTextContent('Overrides by route')
    expect(steps[3]).toHaveTextContent("One page's own say, which wins over everything above")
    expect(
      within(cascade)
        .getAllByRole('link', { name: /^Then:/ })
        .map((l) => l.getAttribute('href')),
    ).toEqual(['#cascade-collection', '#cascade-route', '#cascade-document'])
    await waitFor(() => expect(steps[0]).toHaveTextContent('2 site entities'))
    expect(steps[2]).toHaveTextContent('1 URL pattern')
    expect(cascade).toHaveTextContent('seeded from krantho.config.ts')
  })

  it("shows the site's identity from config read-only, naming where to change each value", async () => {
    openStructure('/structure/scopes')
    const identity = await screen.findByRole('region', { name: 'From krantho.config.ts' })
    expect(identity).toHaveTextContent('Fjord Studio')
    expect(identity).toHaveTextContent('Change it in krantho.config.ts (site.name)')
    expect(identity).toHaveTextContent('Change it in krantho.config.ts (site.baseUrl)')
    expect(within(identity).queryByRole('textbox')).toBeNull()
  })

  it('offers Save and Import on the database site entities for an admin', async () => {
    openStructure('/structure/scopes')
    const entities = await screen.findByRole('region', { name: 'Site entities' })
    expect(await within(entities).findByRole('button', { name: /Save/ })).toBeInTheDocument()
    expect(within(entities).getByRole('button', { name: /Import/ })).toBeInTheDocument()
  })

  it('keeps the site entities read-only for a viewer', async () => {
    openStructure('/structure/scopes', { role: 'viewer' })
    const entities = await screen.findByRole('region', { name: 'Site entities' })
    expect(entities).toHaveTextContent('Changing them is for admins')
    await waitFor(() =>
      expect(within(entities).queryByText('Loading the graph browser…')).toBeNull(),
    )
    expect(within(entities).queryByRole('button', { name: /Save/ })).toBeNull()
    const archetypes = screen.getByRole('region', { name: 'Collection archetypes' })
    expect(
      within(archetypes).getByRole('button', { name: "Change Pages's archetype" }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it("changes a collection's archetype with its impact, keeping what the kept types had", async () => {
    const sent = openStructure('/structure/scopes')
    const archetypes = await screen.findByRole('region', { name: 'Collection archetypes' })
    const user = userEvent.setup()
    await user.click(within(archetypes).getByRole('button', { name: "Change Pages's archetype" }))
    const dialog = await screen.findByRole('dialog', { name: "Change Pages's archetype" })
    expect(within(dialog).getByRole('checkbox', { name: /^Article/ })).toBeChecked()
    expect(within(dialog).queryByRole('checkbox', { name: /FAQ|How-To/ })).toBeNull()
    await user.click(within(dialog).getByRole('checkbox', { name: /^Breadcrumb/ }))
    expect(
      await within(dialog).findByText(/would keep values no chosen type reads/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'About us' })).toHaveAttribute(
      'href',
      '/site/pages/about?mode=data',
    )
    expect(dialog).toHaveTextContent('can be filled from its fields: title, description')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(putBodies(sent)).toHaveLength(1))
    expect(putBodies(sent)[0]).toEqual({
      id: 'collection:pages',
      config: {
        entities: [{ '@type': 'Article', role: 'primary', properties: {} }],
        fieldMappings: { headline: 'title' },
      },
    })
  })

  it('changes nothing stored when the settings could not be read', async () => {
    const sent = openStructure('/structure/scopes', { configsFail: true })
    const entities = await screen.findByRole('region', { name: 'Site entities' })
    expect(entities).toHaveTextContent(SETTINGS_UNREAD)
    expect(within(entities).queryByRole('button', { name: /Save/ })).toBeNull()
    const archetypes = screen.getByRole('region', { name: 'Collection archetypes' })
    expect(archetypes).toHaveTextContent('Not read')
    const change = within(archetypes).getByRole('button', { name: "Change Pages's archetype" })
    expect(change).toHaveAttribute('aria-disabled', 'true')
    expect(change).toHaveAccessibleDescription(SETTINGS_UNREAD)
    await userEvent.setup().click(change)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(putBodies(sent)).toHaveLength(0)
  })

  it('starts from no entities only when a collection truly has no stored archetype', async () => {
    const configs = CONFIGS.filter((config) => config.id !== 'collection:services')
    const sent = openStructure('/structure/scopes', { configs })
    const archetypes = await screen.findByRole('region', { name: 'Collection archetypes' })
    const user = userEvent.setup()
    await user.click(
      within(archetypes).getByRole('button', { name: "Change Services's archetype" }),
    )
    const dialog = await screen.findByRole('dialog', { name: "Change Services's archetype" })
    await user.click(within(dialog).getByRole('checkbox', { name: /^Service/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(putBodies(sent)).toHaveLength(1))
    expect(putBodies(sent)[0]).toEqual({
      id: 'collection:services',
      config: { entities: [{ '@type': 'Service', properties: {} }] },
    })
  })

  it('lists the URL patterns and the pages with their own settings, and a catalog without retired features', async () => {
    openStructure('/structure/scopes')
    const routes = await screen.findByRole('region', { name: 'URL patterns' })
    expect(routes).toHaveTextContent('/services/*')
    const documents = screen.getByRole('region', { name: 'Pages with their own settings' })
    expect(within(documents).getByRole('link', { name: 'pages/about' })).toHaveAttribute(
      'href',
      '/site/pages/about?mode=data',
    )
    const catalog = screen.getByRole('region', { name: 'The catalog' })
    expect(catalog).toHaveTextContent('Dataset Search · shown only under conditions')
    expect(catalog).not.toHaveTextContent(/FAQ|How-to/)
    await userEvent
      .setup()
      .click(within(catalog).getByRole('button', { name: 'Details of Article' }))
    expect(await screen.findByRole('dialog', { name: 'Article' })).toBeInTheDocument()
  })
})

describe('Structure › Crawlers & assistants', () => {
  it('shows the sitemap as served', async () => {
    openStructure('/structure/crawlers')
    const sitemap = await screen.findByRole('region', { name: 'Sitemap' })
    expect(sitemap).toHaveTextContent('As the site serves it at /sitemap.xml: 2 URLs')
    expect(within(sitemap).getByRole('link', { name: /fjord\.example\/about/ })).toBeInTheDocument()
  })

  it("falls back to krantho's own list when the site serves no sitemap, and says so", async () => {
    openStructure('/structure/crawlers', { servedSitemap: null })
    const sitemap = await screen.findByRole('region', { name: 'Sitemap' })
    expect(sitemap).toHaveTextContent('The site serves nothing at /sitemap.xml (HTTP 404).')
    expect(sitemap).toHaveTextContent("What krantho's API builds")
  })

  it('saves and resets the robots.txt override', async () => {
    const sent = openStructure('/structure/crawlers')
    const robots = await screen.findByRole('region', { name: 'robots.txt' })
    expect(robots).toHaveTextContent('The site serves this at /robots.txt.')
    const field = within(robots).getByRole('textbox', { name: 'robots.txt' })
    const user = userEvent.setup()
    await user.type(field, '\nDisallow: /private')
    await user.click(within(robots).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(putBodies(sent)).toHaveLength(1))
    const saved = putBodies(sent)[0] as { config: SeoConfigData }
    // Beside the entities, which are sent back as they were stored
    expect(saved.config.robotsTxt).toContain('Disallow: /private')
    expect(saved.config.entities).toEqual(CONFIGS.find((c) => c.id === 'site')?.config.entities)
    expect(JSON.stringify(saved.config.entities)).not.toContain('Disallow')
    expect(
      await screen.findByText('Override saved. /api/seo/robots.txt now serves it.'),
    ).toBeInTheDocument()
  })

  it('removes the override, keeping the entities as stored', async () => {
    const configs = CONFIGS.map((config) =>
      config.id === 'site'
        ? { ...config, config: { ...config.config, robotsTxt: 'User-agent: *\nDisallow: /' } }
        : config,
    )
    const sent = openStructure('/structure/crawlers', { configs })
    const robots = await screen.findByRole('region', { name: 'robots.txt' })
    await userEvent.setup().click(within(robots).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(putBodies(sent)).toHaveLength(1))
    expect(putBodies(sent)[0]).toEqual({
      id: 'site',
      config: { entities: CONFIGS.find((c) => c.id === 'site')?.config.entities },
    })
  })

  it('saves no override over site settings it could not read', async () => {
    const sent = openStructure('/structure/crawlers', { configsFail: true })
    const robots = await screen.findByRole('region', { name: 'robots.txt' })
    const user = userEvent.setup()
    await user.type(within(robots).getByRole('textbox', { name: 'robots.txt' }), '\nDisallow: /x')
    await user.click(within(robots).getByRole('button', { name: 'Save' }))
    const errors = await screen.findByRole('alert', { name: 'Errors' })
    await waitFor(() =>
      expect(within(errors).getByRole('button', { name: /Dismiss/ })).toBeInTheDocument(),
    )
    expect(putBodies(sent)).toHaveLength(0)
  })

  it('keeps robots.txt read-only for a viewer', async () => {
    openStructure('/structure/crawlers', { role: 'viewer' })
    const robots = await screen.findByRole('region', { name: 'robots.txt' })
    expect(within(robots).getByRole('textbox', { name: 'robots.txt' })).toHaveAttribute('readonly')
    expect(within(robots).getByRole('button', { name: 'Reset' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows llms.txt as served, read-only, with where it comes from', async () => {
    openStructure('/structure/crawlers')
    const llms = await screen.findByRole('region', { name: 'llms.txt' })
    expect(within(llms).getByLabelText('llms.txt as served')).toHaveTextContent('# Fjord Studio')
    expect(llms).toHaveTextContent(
      "Served from krantho's API, built from the live pages on each request",
    )
    expect(within(llms).queryByRole('textbox')).toBeNull()
  })

  it('says the origin could not be determined when the API does not name it', async () => {
    openStructure('/structure/crawlers', { llmsOrigin: null })
    const llms = await screen.findByRole('region', { name: 'llms.txt' })
    expect(llms).toHaveTextContent('its origin could not be determined')
    expect(llms).not.toHaveTextContent('built from the live pages on each request')
  })

  it("names the site's own llms.txt route when it serves something else", async () => {
    openStructure('/structure/crawlers', { servedLlms: `${LLMS}extra` })
    const llms = await screen.findByRole('region', { name: 'llms.txt' })
    expect(llms).toHaveTextContent("Written by the site's own /llms.txt route, not by krantho")
  })
})

describe("Structure › Fill what's missing", () => {
  it('fills one collection only, meta descriptions then properties, never forcing', async () => {
    const sent = openStructure('/structure/graph')
    const user = userEvent.setup()
    // The header's button is inert until the site is read; the dialog's, until the AI provider is
    await settled()
    await user.click(screen.getByRole('button', { name: "Fill what's missing" }))
    const dialog = screen.getByRole('dialog', { name: "Fill what's missing" })
    await settled()
    expect(dialog).toHaveTextContent('It never overwrites a value someone set.')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Scope' }), 'services')
    await user.click(within(dialog).getByRole('button', { name: "Fill what's missing" }))
    expect(await within(dialog).findByText(/^Finished\./)).toBeInTheDocument()
    expect(sent.filter((e) => e.key === 'POST /api/seo/enrich').map((e) => e.body)).toEqual([
      { type: 'meta-descriptions', force: false, scope: 'collection', collection: 'services' },
      { type: 'archetype', force: false, scope: 'collection', collection: 'services' },
    ])
    expect(dialog).toHaveTextContent('Meta description · 1 filled')
    expect(dialog).toHaveTextContent('1,200 tokens in, 340 out · fake-model')
  })

  it('keeps running when its dialog closes: both steps start and finish, the header following it', async () => {
    const gate: FillGate = { released: false }
    const sent = openStructure('/structure/graph', { gate })
    const user = userEvent.setup()
    // The header's button is inert until the site is read; the dialog's, until the AI provider is
    await settled()
    await user.click(screen.getByRole('button', { name: "Fill what's missing" }))
    const dialog = screen.getByRole('dialog', { name: "Fill what's missing" })
    await settled()
    await user.click(within(dialog).getByRole('button', { name: "Fill what's missing" }))
    expect(await within(dialog).findByText(/^Step 1 of 2, Meta description/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close (it keeps running)' }))
    expect(screen.queryByRole('dialog', { name: "Fill what's missing" })).toBeNull()
    expect(
      await screen.findByText(/^Filling… step 1 of 2 \(Meta description\)/),
    ).toBeInTheDocument()
    gate.released = true
    expect(
      await screen.findByText(
        "Fill what's missing finished. Open it to see what each step filled.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
    expect(sent.filter((e) => e.key === 'POST /api/seo/enrich').map((e) => e.body)).toEqual([
      { type: 'meta-descriptions', force: false, scope: 'all' },
      { type: 'archetype', force: false, scope: 'all' },
    ])
    expect(screen.queryByText(/^Filling…/)).toBeNull()
    await user.click(screen.getByRole('button', { name: "Fill what's missing" }))
    const again = await screen.findByRole('dialog', { name: "Fill what's missing" })
    expect(again).toHaveTextContent('Meta description · 1 filled')
    expect(again).toHaveTextContent('Schema.org properties · 1 filled')
  }, 15_000)

  it("opens from the palette's Enrich missing SEO", async () => {
    openStructure('/structure/rich-results')
    const user = userEvent.setup()
    await screen.findByRole('tab', { name: 'Rich results' })
    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.click(await within(palette).findByRole('option', { name: /Enrich missing SEO/ }))
    expect(await screen.findByRole('dialog', { name: "Fill what's missing" })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens from the palette address, and is for admins only', async () => {
    openStructure('/structure/graph?fill=1')
    expect(await screen.findByRole('dialog', { name: "Fill what's missing" })).toBeInTheDocument()
  })

  it('is disabled for an editor, saying why', async () => {
    openStructure('/structure/graph', { role: 'editor' })
    const fill = await screen.findByRole('button', { name: "Fill what's missing" })
    // The button is disabled with "Reading the site…" while the tree loads, so wait for the reason
    await waitFor(() => expect(fill).toHaveAccessibleDescription('Enrichment is run by an admin.'))
    expect(fill).toHaveAttribute('aria-disabled', 'true')
  })
})
