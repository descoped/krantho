import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type FakeOptions, installApi, renderAt } from './fixtures/site-api.js'
import { type StructureOptions, structureRoutes } from './fixtures/structure-api.js'
import { BUSINESS_ID } from './fixtures/structure-data.js'
import { SITE_FINDINGS } from './fixtures/structure-pages.js'

beforeAll(async () => {
  await Promise.all([
    import('../src/structure/structure-page.js'),
    import('../src/shell/app-shell.js'),
  ])
}, 60_000)

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Open extends StructureOptions {
  role?: FakeOptions['role']
}

function openStructure(path: string, options: Open = {}): ReturnType<typeof installApi> {
  const calls = installApi({ role: options.role, routes: structureRoutes(options) })
  renderAt(path)
  return calls
}

async function panel(): Promise<HTMLElement> {
  return screen.findByRole('tabpanel')
}

/** Every retired search feature's name: Studio never shows one */
const RETIRED = /\bFAQ\b|How-?to|sitelinks search box/i

describe('Structure', () => {
  it('opens on Graph, with the header, its actions and the intro band from real sources', async () => {
    openStructure('/structure')
    expect(await screen.findByRole('heading', { level: 1, name: 'Structure' })).toBeInTheDocument()
    expect(
      await screen.findByText(
        /How search engines and AI assistants read Fjord Studio\. Every page carries one connected Schema\.org graph — no one writes JSON-LD by hand\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validate all pages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Fill what's missing" })).toBeInTheDocument()
    const intro = screen.getByRole('region', {
      name: 'One graph per page, assembled from four scopes',
    })
    await waitFor(() => expect(within(intro).getByText('1 / 3')).toBeInTheDocument())
    expect(within(intro).getByText('2')).toBeInTheDocument()
    expect(within(intro).getByText('5 / 9')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves between the tabs with the arrow keys, one tab stop, the address following', async () => {
    openStructure('/structure/graph')
    const graph = await screen.findByRole('tab', { name: 'Graph' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Graph',
      'Scopes & archetypes',
      'Rich results',
      'Crawlers & assistants',
    ])
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toEqual([graph])
    const user = userEvent.setup()
    graph.focus()
    await user.keyboard('{ArrowRight}')
    const scopes = screen.getByRole('tab', { name: 'Scopes & archetypes' })
    await waitFor(() => expect(scopes).toHaveAttribute('aria-selected', 'true'))
    expect(scopes).toHaveFocus()
    expect(await panel()).toHaveAccessibleName('Scopes & archetypes')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Structure', 'Scopes & archetypes'])
  })

  it('does not know an old tab', async () => {
    openStructure('/structure/documents')
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  })

  it('re-reads every live page on Validate all pages and says what it found', async () => {
    const calls = openStructure('/structure/rich-results')
    await screen.findByRole('region', { name: /Local business/ })
    const before = calls.filter((call) => call.key === 'GET /api/seo/findings').length
    await userEvent.setup().click(screen.getByRole('button', { name: 'Validate all pages' }))
    expect(
      await screen.findByText('Validated 3 live pages: 1 with a valid graph.'),
    ).toBeInTheDocument()
    expect(calls.filter((call) => call.key === 'GET /api/seo/findings').length).toBe(before + 1)
  })
})

describe('Structure › Graph', () => {
  it('picks a live page, draws its nodes with type, @id and chips, and a legend of where they come from', async () => {
    openStructure('/structure/graph')
    const picker = await screen.findByRole('combobox', { name: 'Page' })
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(SITE_FINDINGS.pages.map((page) => `${page.path} · ${page.collection}/${page.slug}`))
    const legend = await screen.findByRole('list', { name: 'Where each node comes from' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.ui-chip')?.textContent),
    ).toEqual(['site', 'collection', 'document', 'derived'])
    const nodes = await screen.findByRole('list', { name: 'Graph nodes' })
    const article = within(nodes).getByRole('button', { name: /^Article/ })
    expect(article).toHaveTextContent('document')
    expect(article).toHaveTextContent('#article')
    expect(article).toHaveTextContent('11 properties')
    expect(article).toHaveTextContent('Article')
    const business = within(nodes).getByRole('button', { name: /^ProfessionalService/ })
    expect(business).toHaveTextContent('Local business · not eligible')
    expect(business).toHaveTextContent('1 missing')
    // Below 1200px the graph is this list, links named in words
    expect(within(nodes).getByRole('list', { name: 'Links of WebPage' })).toHaveTextContent(
      'breadcrumb → BreadcrumbList',
    )
  })

  it('shows the selected node with each value and its source, and what is missing with a Fix', async () => {
    openStructure('/structure/graph?page=pages/about')
    const nodes = await screen.findByRole('list', { name: 'Graph nodes' })
    const user = userEvent.setup()
    await user.click(within(nodes).getByRole('button', { name: /^ProfessionalService/ }))
    expect(within(nodes).getByRole('button', { name: /^ProfessionalService/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const card = screen.getByRole('region', { name: 'Selected node: ProfessionalService' })
    const missing = within(card).getByRole('list', { name: 'Missing requirements' })
    expect(missing).toHaveTextContent("Google's Local business needs address.")
    expect(within(missing).getByRole('link', { name: 'Fix Local business' })).toHaveAttribute(
      'href',
      '/structure/scopes#scope-site',
    )
    expect(card).toHaveTextContent('A site entity: every page states it')
    const entity = card.querySelector(`li[data-entity-id="${BUSINESS_ID}"]`)
    expect(entity).not.toBeNull()
    const name = within(entity as HTMLElement).getByRole('row', { name: /^name/ })
    expect(within(name).getByText('site')).toBeInTheDocument()
  })

  it('shows what the page emits as served, from its own HTML', async () => {
    openStructure('/structure/graph?page=pages/about')
    await screen.findByRole('list', { name: 'Graph nodes' })
    const source = screen.getByRole('region', { name: 'application/ld+json · /about' })
    expect(source).toHaveTextContent('"@id": "https://fjord.example/about/#webpage"')
    expect(screen.getByText('What the page emits · view-source')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export JSON-LD' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit or import in Data mode' })).toHaveAttribute(
      'href',
      '/site/pages/about?mode=data',
    )
  })

  it('draws a canvas of node buttons with labelled links from 1200px', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width: 1200px'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    openStructure('/structure/graph?page=pages/about')
    const canvas = await screen.findByRole('region', { name: 'Graph canvas' })
    expect(within(canvas).getAllByRole('button')).toHaveLength(5)
    const labels = [...canvas.querySelectorAll('text')].map((label) => label.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(['publisher', 'isPartOf', 'mainEntity', 'breadcrumb']),
    )
    expect(within(canvas).getByRole('button', { name: /^WebPage/ })).toHaveTextContent(
      'Links: isPartOf → WebSite; mainEntity → Article; breadcrumb → BreadcrumbList',
    )
    expect(screen.queryByRole('list', { name: 'Graph nodes' })).toBeNull()
    const named = within(canvas).getByRole('button', { name: /^WebPage/ })
    expect(named.textContent).not.toMatch(/\s[.:,]/)
  })

  it('says so when the page serves no JSON-LD', async () => {
    openStructure('/structure/graph?page=pages/home')
    expect(await screen.findByText('The page could not be read as served')).toBeInTheDocument()
    expect(screen.getByText('The page at / serves no JSON-LD.')).toBeInTheDocument()
  })
})

describe('Structure › Rich results', () => {
  it('has one card per feature with eligible of applicable, what is missing with Fix, and the rule', async () => {
    openStructure('/structure/rich-results')
    const local = await screen.findByRole('region', { name: 'Local business · Google' })
    expect(local).toHaveTextContent('Not eligible')
    expect(local).toHaveTextContent('0 / 3 live pages eligible')
    expect(local).toHaveTextContent(
      'ProfessionalService.address missing on 3 pages: /about, /, /services/strategy',
    )
    expect(within(local).getByRole('link', { name: /^Fix Local business/ })).toHaveAttribute(
      'href',
      '/structure/scopes#scope-site',
    )
    expect(within(local).getByRole('link', { name: /Google's rule/ })).toHaveAttribute(
      'href',
      'https://developers.google.com/search/docs/appearance/structured-data/local-business',
    )
    const article = screen.getByRole('region', { name: 'Article · Google' })
    expect(article).toHaveTextContent('Partly eligible')
    expect(within(article).getByRole('link', { name: /^Fix Article/ })).toHaveAttribute(
      'href',
      '/site/pages/home?mode=data',
    )
    expect(screen.getByRole('region', { name: 'Site names · Google' })).toHaveTextContent(
      'Condition: On the home page.',
    )
  })

  it('has a card for each feature the rules show that no page uses yet, restricted ones saying so', async () => {
    openStructure('/structure/rich-results')
    const event = await screen.findByRole('region', { name: 'Event · Google' })
    expect(event).toHaveTextContent('Not used yet')
    expect(event).toHaveTextContent('0 / 0 live pages eligible')
    expect(event).toHaveTextContent('No page of this site is of this type yet (Event).')
    expect(within(event).queryByRole('link', { name: /^Fix/ })).toBeNull()
    const dataset = screen.getByRole('region', { name: 'Dataset Search · Google' })
    expect(dataset).toHaveTextContent('Shown on conditions')
    expect(dataset).toHaveTextContent(
      "0 / 0 live pages eligible: shown only under the rule's conditions",
    )
    // The features pages use come first, then the rest, by name
    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent?.replace(/ · Google$/, ''))
    expect(titles).toEqual([
      'Article',
      'Breadcrumb',
      'Local business',
      'Site names',
      'Dataset Search',
      'Event',
    ])
  })

  it('never names a retired feature on any tab', async () => {
    for (const tab of ['graph', 'scopes', 'rich-results', 'crawlers']) {
      const { unmount } = await renderTab(tab)
      expect(document.body.textContent ?? '').not.toMatch(RETIRED)
      unmount()
    }
  })
})

async function renderTab(tab: string): Promise<{ unmount: () => void }> {
  const { cleanup } = await import('@testing-library/react')
  openStructure(`/structure/${tab}`)
  await screen.findByRole('tab', { name: 'Graph' })
  await waitFor(() => expect(screen.queryByText(/^Reading/)).toBeNull())
  return { unmount: cleanup }
}
