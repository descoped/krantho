import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARTICLE_ID,
  BREADCRUMB_ID,
  dataRoutes,
  enrichRoutes,
  ORG_ID,
  type Version,
  versionRoutes,
  WEBPAGE_ID,
} from './fixtures/data-api.js'
import {
  aheadDoc,
  contentOf,
  type FakeDoc,
  header,
  memoryStorage,
  type StoreOptions,
  storeRoutes,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import {
  type FakeOptions,
  held,
  installApi,
  json,
  type Route,
  renderAt,
} from './fixtures/site-api.js'

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const VERSIONS: Version[] = [
  { version: 3, title: 'Pricing' },
  { version: 2, title: 'Prices' },
]

interface OpenOptions extends Partial<Omit<StoreOptions, 'doc'>> {
  doc?: FakeDoc | undefined
  path?: string | undefined
  role?: FakeOptions['role']
  features?: FakeOptions['features']
  llm?: boolean | undefined
  routes?: Record<string, Route> | undefined
}

/** Open pricing's editor — in Data mode unless another address is given */
function openData(options: OpenOptions = {}): ReturnType<typeof installApi> {
  const doc = options.doc ?? aheadDoc()
  const calls = installApi({
    role: options.role,
    features: options.features,
    routes: {
      ...storeRoutes({ ...options, doc }),
      ...dataRoutes({ llm: options.llm }),
      ...versionRoutes(() => VERSIONS),
      ...options.routes,
    },
  })
  renderAt(options.path ?? '/site/pages/pricing?mode=data')
  return calls
}

async function card(name: string | RegExp): Promise<HTMLElement> {
  const canvas = await screen.findByRole('tabpanel')
  return within(canvas).findByRole('region', { name })
}

/** Ask to restore v2 and confirm it */
async function restoreV2(): Promise<void> {
  const history = await card('History')
  const user = userEvent.setup()
  await user.click(await within(history).findByRole('button', { name: 'Restore v2' }))
  const dialog = await screen.findByRole('dialog', { name: 'Restore v2?' })
  await user.click(within(dialog).getByRole('button', { name: 'Restore' }))
}

function count(calls: ReturnType<typeof installApi>, key: string): number {
  return calls.filter((call) => call.key === key).length
}

describe('Data mode: the mode and its address', () => {
  it('opens from ?mode=data, and switching modes keeps unsaved work without asking to leave', async () => {
    openData()
    const bar = await header()
    expect(within(bar).getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true')
    const user = userEvent.setup()
    const social = await card('Social cards')
    await user.type(within(social).getByRole('textbox', { name: 'og-title' }), 'Plans')
    await user.click(within(bar).getByRole('tab', { name: 'Structure' }))
    expect(await screen.findByRole('textbox', { name: 'Body' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'og-title' })).toHaveValue('Plans')
  })

  it('says a new document has nothing to read until it is saved', async () => {
    openData({ path: '/new/pages?mode=data' })
    expect(await screen.findByText('Nothing saved yet')).toBeVisible()
  })

  it('shows only the history when SEO is off', async () => {
    openData({ features: { localization: 'enabled' } })
    const canvas = await screen.findByRole('tabpanel')
    expect(await within(canvas).findByText(/SEO is off on this site/)).toBeVisible()
    expect(await card('History')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Search result' })).toBeNull()
  })
})

describe('Data mode: previews from the draft', () => {
  it('shows the search result and social cards as the draft is typed', async () => {
    openData()
    const result = await card('Search result')
    expect(result).toHaveTextContent('fjord.example › pricing')
    expect(result).toHaveTextContent('Pricing')
    expect(result).toHaveTextContent('What it costs')
    const social = await card('Social cards')
    expect(social).toHaveTextContent('summary')
    await userEvent.setup().type(within(social).getByRole('textbox', { name: 'og-title' }), 'Share')
    const og = within(social).getByText('Open Graph · og:type website').closest('figure')
    expect(og).toHaveTextContent('Share')
  })

  it('edits indexing in the draft and shows the robots tag it makes', async () => {
    openData()
    const indexing = await card('Indexing')
    await userEvent.setup().click(within(indexing).getByRole('checkbox', { name: /Index/ }))
    expect(indexing).toHaveTextContent('<meta name="robots" content="noindex, follow" />')
    expect(within(await header()).getByRole('button', { name: 'Save draft' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })
})

describe('Data mode: the graph the page emits', () => {
  it('lists each entity with its type, @id and scope, and each value with its §6 source', async () => {
    openData()
    const graph = await card('JSON-LD graph · what this page emits')
    const entities = await within(graph).findByRole('list', { name: 'Entities' })
    const article = within(entities)
      .getByRole('heading', { name: 'Article' })
      .closest('li') as HTMLElement
    expect(article).toHaveTextContent(ARTICLE_ID)
    expect(article).toHaveTextContent('page')
    const source = (key: string): string =>
      within(article)
        .getByRole('rowheader', { name: new RegExp(`^${key}`) })
        .closest('tr')?.textContent ?? ''
    expect(source('headline')).toContain('document')
    expect(source('articleSection')).toContain('collection')
    expect(source('about')).toContain('URL pattern')
    expect(source('url')).toContain('computed')
    expect(source('publisher')).toContain('linked')
    const organization = within(entities).getByRole('heading', { name: 'Organization' })
    expect(organization.closest('li')).toHaveTextContent('site.name')
    const legend = within(graph).getByRole('list', { name: 'Sources' })
    expect(legend).toHaveTextContent('Set in this document · 1')
  })

  it('lists the nodes krantho adds while composing the page, with their type, @id and a computed source', async () => {
    openData()
    const graph = await card('JSON-LD graph · what this page emits')
    const entities = await within(graph).findByRole('list', { name: 'Entities' })
    const webPage = within(entities)
      .getByRole('heading', { name: 'WebPage' })
      .closest('li') as HTMLElement
    expect(webPage).toHaveAttribute('data-entity-id', WEBPAGE_ID)
    expect(webPage).toHaveTextContent(WEBPAGE_ID)
    const row = within(webPage)
      .getByRole('rowheader', { name: /^dateModified/ })
      .closest('tr')
    expect(row).toHaveTextContent('computed')
    const breadcrumb = within(entities)
      .getByRole('heading', { name: 'BreadcrumbList' })
      .closest('li') as HTMLElement
    expect(breadcrumb).toHaveAttribute('data-entity-id', BREADCRUMB_ID)
    expect(breadcrumb).toHaveTextContent('page')
  })

  it('follows a linked value to its entity, and shows the JSON-LD as composed', async () => {
    openData()
    const graph = await card('JSON-LD graph · what this page emits')
    const user = userEvent.setup()
    await user.click(await within(graph).findByRole('button', { name: `Go to ${ORG_ID}` }))
    expect(within(graph).getByRole('heading', { name: 'Organization' })).toHaveFocus()
    await user.click(await within(graph).findByText('What the page emits · view-source'))
    expect(within(graph).getByRole('region', { name: 'application/ld+json' })).toHaveTextContent(
      '"@graph"',
    )
  })

  it('opens the graph editor with Import and Save, or only to browse when read-only', async () => {
    openData()
    const graph = await card('JSON-LD graph · what this page emits')
    const user = userEvent.setup()
    await user.click(await within(graph).findByRole('button', { name: 'Edit the graph' }))
    expect(await within(graph).findByRole('button', { name: 'Apply to draft' })).toBeInTheDocument()
    expect(within(graph).getByRole('button', { name: 'Import' })).toBeInTheDocument()
    expect(graph).toHaveTextContent('Apply adds your graph changes to this document’s draft.')
  })

  it('says when Copy could not reach the clipboard', async () => {
    openData()
    const graph = await card('JSON-LD graph · what this page emits')
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'))
    await user.click(await within(graph).findByText('What the page emits · view-source'))
    await user.click(within(graph).getByRole('button', { name: 'Copy' }))
    expect(
      await within(graph).findByText('Could not copy. Select the text and copy it yourself.'),
    ).toBeVisible()
  })
})

describe('Data mode: rich results and findings', () => {
  it('shows rich results from the readers’ rules and findings per search engine', async () => {
    openData()
    const rich = await card('Rich results')
    const list = await within(rich).findByRole('list', { name: 'Rich results' })
    expect(list).toHaveTextContent('ArticleGoogle · ArticleEligible')
    expect(list).toHaveTextContent('BreadcrumbBing · BreadcrumbListNot eligible')
    const findings = await card('Findings per search engine')
    const google = await within(findings).findByRole('region', { name: 'Google' })
    expect(google).toHaveTextContent('1 error')
    expect(google).toHaveTextContent('Article needs an image. Article.image')
    expect(within(google).getByRole('link', { name: /Documentation/ })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(within(findings).getByRole('region', { name: 'Bing' })).toHaveTextContent('No findings.')
  })

  it('says rich results wait for the live page', async () => {
    openData({ doc: { ...aheadDoc(), liveVersion: null } })
    const rich = await card('Rich results')
    expect(await within(rich).findByText(/Checked once the page is live/)).toBeVisible()
  })
})

describe('Data mode: enrichment', () => {
  it('fills what is missing — the meta description, then the Schema.org properties — and reads the page again', async () => {
    const sent: Array<Record<string, unknown>> = []
    const provider = held(dataRoutes()['GET /api/settings/llm'] as Route)
    const calls = openData({
      routes: { ...enrichRoutes(sent), 'GET /api/settings/llm': provider.route },
    })
    const enrichment = await card('Enrichment')
    // Until the AI provider is read there is nothing to run: no button, no status region
    await provider.requested
    expect(enrichment).toHaveTextContent('Reading the AI provider')
    expect(within(enrichment).queryByRole('button', { name: 'Enrich this document' })).toBeNull()
    expect(within(enrichment).queryByRole('status')).toBeNull()
    provider.release()
    await within(enrichment).findByRole('button', { name: 'Enrich this document' })
    expect(enrichment).toHaveTextContent('Fills what is missing')
    expect(enrichment).toHaveTextContent('never overwrites')
    expect(enrichment).toHaveTextContent('saved to the document at once')
    expect(enrichment).toHaveTextContent('the structured data on the live page')
    expect(enrichment).toHaveTextContent('changes straight away')
    expect(enrichment).not.toHaveTextContent(/unchanged until/)
    expect(within(enrichment).getByRole('status')).toBeInTheDocument()
    const reads = count(calls, 'GET /api/content/pages/pricing')
    await userEvent
      .setup()
      .click(await within(enrichment).findByRole('button', { name: 'Enrich this document' }))
    // Two jobs run one after the other, each followed through the API: slow under a loaded suite
    await waitFor(
      () => expect(within(enrichment).getByRole('status')).toHaveTextContent(/Filled 2 properties/),
      { timeout: 5000 },
    )
    expect(enrichment).toHaveTextContent('Meta description · Wrote 142 characters')
    expect(sent).toEqual([
      {
        type: 'meta-descriptions',
        scope: 'item',
        force: false,
        collection: 'pages',
        slug: 'pricing',
      },
      { type: 'archetype', scope: 'item', force: false, collection: 'pages', slug: 'pricing' },
    ])
    await waitFor(
      () => expect(count(calls, 'GET /api/content/pages/pricing')).toBeGreaterThan(reads),
      {
        timeout: 5000,
      },
    )
  })

  it('shows the API’s refusal, such as a job already running', async () => {
    openData({
      routes: {
        'POST /api/seo/enrich': () =>
          json({ error: 'An enrichment job is already running', jobId: 'other' }, 409),
      },
    })
    const enrichment = await card('Enrichment')
    await userEvent
      .setup()
      .click(await within(enrichment).findByRole('button', { name: 'Enrich this document' }))
    expect(
      await within(enrichment).findByText('An enrichment job is already running'),
    ).toBeVisible()
  })

  it('says where to set up a language model when none is', async () => {
    openData({ llm: false })
    const enrichment = await card('Enrichment')
    expect(await within(enrichment).findByText(/No language model is set up/)).toBeVisible()
    expect(within(enrichment).getByRole('link', { name: 'Setup › AI provider' })).toHaveAttribute(
      'href',
      '/setup/ai',
    )
    expect(within(enrichment).queryByRole('button', { name: 'Enrich this document' })).toBeNull()
  })

  it('says why it cannot run: an editor’s role, or unsaved changes', async () => {
    openData({ role: 'editor' })
    const enrichment = await card('Enrichment')
    const action = await within(enrichment).findByRole('button', { name: 'Enrich this document' })
    expect(action).toHaveAttribute('aria-disabled', 'true')
    expect(enrichment).toHaveTextContent('Enrichment is run by an admin.')
  })

  it('does not run while the site’s locales are unknown', async () => {
    openData({ routes: { 'GET /api/settings/locales': () => json({ error: 'Broken' }, 500) } })
    const enrichment = await card('Enrichment')
    const action = await within(enrichment).findByRole('button', { name: 'Enrich this document' })
    expect(action).toHaveAttribute('aria-disabled', 'true')
    expect(enrichment).toHaveTextContent("The site's locales could not be read")
  })

  it('waits for unsaved changes to be saved', async () => {
    openData()
    const social = await card('Social cards')
    await userEvent.setup().type(within(social).getByRole('textbox', { name: 'og-title' }), 'x')
    const enrichment = await card('Enrichment')
    await waitFor(() => expect(enrichment).toHaveTextContent(/Save or discard your changes first/))
  })
})

describe('Data mode: history', () => {
  it('lists each version with time, author and the live and current chips; Diff opens with its heading focused', async () => {
    openData()
    const history = await card('History')
    const list = await within(history).findByRole('list', { name: 'Versions' })
    const [v3, v2] = within(list).getAllByRole('listitem')
    expect(v3).toHaveTextContent('v3')
    expect(v3).toHaveTextContent('person@example.test')
    expect(v3).toHaveTextContent('current')
    expect(v2).toHaveTextContent('live')
    const user = userEvent.setup()
    const diff = within(v3 as HTMLElement).getByRole('button', {
      name: 'Diff v3 with the version before',
    })
    await user.click(diff)
    const heading = await within(history).findByRole('heading', { name: 'v2 → v3' })
    expect(heading).toHaveFocus()
    const split = within(history).getByRole('button', { name: 'Split' })
    await user.click(split)
    expect(split).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(history).getByRole('button', { name: 'Close the diff' }))
    expect(diff).toHaveFocus()
  })

  it('reads the emitted graph of the locale being edited', async () => {
    const calls = openData({
      doc: { ...aheadDoc(), locale: 'no' },
      path: '/site/pages/pricing?locale=no&mode=data',
    })
    await card('JSON-LD graph · what this page emits')
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'GET /api/seo/preview/pages/pricing')?.search).toBe(
        '?locale=no',
      ),
    )
  })

  it('restores a version of the locale being edited as a new version, and lists it', async () => {
    const versions: Version[] = [...VERSIONS]
    const doc: FakeDoc = { ...aheadDoc(), locale: 'no' }
    const calls = openData({
      doc,
      role: 'admin',
      path: '/site/pages/pricing?locale=no&mode=data',
      routes: {
        ...versionRoutes(() => versions),
        'POST /api/content/pages/pricing/restore/2': () => {
          doc.version += 1
          versions.unshift({ version: doc.version, title: 'Prices' })
          return json({ restoredVersion: 2, version: doc.version, liveVersion: doc.liveVersion })
        },
      },
    })
    const history = await card('History')
    const restore = await within(history).findByRole('button', { name: 'Restore v2' })
    expect(calls.find((c) => c.key === 'GET /api/content/pages/pricing/versions')?.search).toBe(
      '?locale=no',
    )
    const user = userEvent.setup()
    await user.click(restore)
    const dialog = await screen.findByRole('dialog', { name: 'Restore v2?' })
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /api/content/pages/pricing/restore/2')?.search).toBe(
        '?locale=no',
      ),
    )
    expect(await within(history).findByText('v4')).toBeVisible()
    expect(await screen.findByText(/v2 restored as v4/)).toBeVisible()
  })

  it('announces a diff whose versions could not be read', async () => {
    openData({
      routes: {
        'GET /api/content/pages/pricing/versions/2': () =>
          json({ error: 'Version 2 could not be read' }, 500),
      },
    })
    const history = await card('History')
    await userEvent
      .setup()
      .click(
        await within(history).findByRole('button', { name: 'Diff v3 with the version before' }),
      )
    expect(await within(history).findByRole('alert')).toHaveTextContent(
      'Version 2 could not be read',
    )
  })

  it('announces a restore the store refused', async () => {
    openData({
      role: 'admin',
      routes: {
        'POST /api/content/pages/pricing/restore/2': () =>
          json({ error: 'The document is locked' }, 423),
      },
    })
    await restoreV2()
    const alert = await within(await card('History')).findByRole('alert')
    expect(alert).toHaveTextContent('v2 could not be restored: The document is locked')
  })

  it('tells a restore that could not be refreshed from one that failed', async () => {
    let restored = false
    const doc = aheadDoc()
    openData({
      doc,
      role: 'admin',
      routes: {
        'GET /api/content/pages/pricing': () =>
          restored ? json({ error: 'Broken' }, 500) : json(contentOf(doc)),
        'POST /api/content/pages/pricing/restore/2': () => {
          restored = true
          return json({ restoredVersion: 2, version: 4, liveVersion: 2 })
        },
      },
    })
    await restoreV2()
    const alert = await within(await card('History')).findByRole('alert')
    expect(alert).toHaveTextContent(
      'v2 was restored as v4, but the page could not be refreshed. Reload it to see the restored version.',
    )
  })

  it('holds Restore while a restore is under way', async () => {
    openData({
      role: 'admin',
      routes: {
        'POST /api/content/pages/pricing/restore/2': () => new Promise<Response>(() => undefined),
      },
    })
    await restoreV2()
    const history = await card('History')
    await waitFor(() =>
      expect(within(history).getByRole('button', { name: 'Restore v2' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
  })

  it('reads the history again after a save', async () => {
    const calls = openData()
    const social = await card('Social cards')
    const user = userEvent.setup()
    await user.type(within(social).getByRole('textbox', { name: 'og-title' }), 'Plans')
    await within(await card('History')).findByRole('list', { name: 'Versions' })
    const before = count(calls, 'GET /api/content/pages/pricing/versions')
    await user.click(within(await header()).getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(count(calls, 'GET /api/content/pages/pricing/versions')).toBeGreaterThan(before),
    )
  })

  it('offers Restore only to an admin', async () => {
    openData({ role: 'editor' })
    const history = await card('History')
    await within(history).findByRole('list', { name: 'Versions' })
    expect(within(history).queryByRole('button', { name: /^Restore v/ })).toBeNull()
  })
})

describe('Data mode: document graph edits follow content permissions', () => {
  it('lets an editor stage graph changes as content drafts', async () => {
    openData({ role: 'editor' })
    const graph = await card('JSON-LD graph · what this page emits')
    await userEvent
      .setup()
      .click(await within(graph).findByRole('button', { name: 'Edit the graph' }))
    expect(await within(graph).findByRole('button', { name: 'Apply to draft' })).toBeVisible()
    expect(graph).toHaveTextContent('Publish updates the live page.')
  })
})

describe('Data mode: read-only under someone else’s lock', () => {
  it('disables every edit: the draft fields, the graph, enrichment and Restore', async () => {
    openData({ role: 'admin', lockedBy: 'editor:other@e2e.local' })
    const social = await card('Social cards')
    await waitFor(() =>
      expect(within(social).getByRole('textbox', { name: 'og-title' })).toBeDisabled(),
    )
    expect(within(await card('Indexing')).getByRole('checkbox', { name: /Index/ })).toBeDisabled()
    const graph = await card('JSON-LD graph · what this page emits')
    await userEvent
      .setup()
      .click(await within(graph).findByRole('button', { name: 'Browse the graph' }))
    expect(await within(graph).findByText(/Read-only: the graph can be browsed/)).toBeVisible()
    expect(within(graph).queryByRole('button', { name: 'Apply to draft' })).toBeNull()
    const enrichment = await card('Enrichment')
    await waitFor(() => expect(enrichment).toHaveTextContent(/other@e2e\.local is editing/))
    const history = await card('History')
    await within(history).findByRole('list', { name: 'Versions' })
    expect(within(history).queryByRole('button', { name: /^Restore v/ })).toBeNull()
  })
})
