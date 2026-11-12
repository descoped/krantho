import { render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Role } from '../src/lib/auth.js'
import type { RuntimeCapabilities } from '../src/lib/capabilities.js'
import { Studio } from '../src/routes.js'
import {
  DESTINATIONS,
  type DestinationId,
  isDestinationVisible,
  SETUP_TABS,
  type SetupTabId,
  type Viewer,
  visibleDestinations,
  visibleSetupTabs,
} from '../src/shell/destinations.js'
import { UNCONFIGURED_LLM } from './fixtures/setup-api.js'

type AuthMode = RuntimeCapabilities['authMode']

/** Every feature a destination or tab can depend on, all on */
const ALL_FEATURES: Record<string, string> = {
  seo: 'enabled',
  media: 'local',
  runtimeSchema: 'enabled',
  webhookDeliveries: 'enabled',
  checkpoints: 'enabled',
  localization: 'enabled',
}

function caps(features: Record<string, string> = ALL_FEATURES, authMode: AuthMode = 'none') {
  return { persistence: 'sqlite', framework: null, authMode, schemaVersion: 1, features } as const
}

function without(feature: string): Record<string, string> {
  return { ...ALL_FEATURES, [feature]: 'disabled' }
}

const ADMIN: Viewer = { roles: ['admin'], loginRequired: true }
const EDITOR: Viewer = { roles: ['editor'], loginRequired: true }
const VIEWER: Viewer = { roles: ['viewer'], loginRequired: true }
/** A site without sign-in: everyone is an anonymous admin */
const NO_LOGIN: Viewer = { roles: ['admin'], loginRequired: false }

function destinationIds(c: RuntimeCapabilities, viewer: Viewer): DestinationId[] {
  return visibleDestinations(c, viewer).map((d) => d.id)
}

function tabIds(c: RuntimeCapabilities, viewer: Viewer): SetupTabId[] {
  return visibleSetupTabs(c, viewer).map((t) => t.id)
}

describe('destinations', () => {
  it('lists Pulse, Site, Structure, Media and Setup in that order', () => {
    expect(DESTINATIONS.map((d) => d.label)).toEqual([
      'Pulse',
      'Site',
      'Structure',
      'Media',
      'Setup',
    ])
    expect(destinationIds(caps(), NO_LOGIN)).toEqual([
      'pulse',
      'site',
      'structure',
      'media',
      'setup',
    ])
  })

  it('hides Structure without the seo capability', () => {
    expect(destinationIds(caps(without('seo')), ADMIN)).not.toContain('structure')
  })

  it('hides Media without the media capability', () => {
    expect(destinationIds(caps(without('media')), ADMIN)).not.toContain('media')
  })

  it('keeps Pulse, Site and Setup for any viewer', () => {
    for (const viewer of [ADMIN, EDITOR, VIEWER, NO_LOGIN]) {
      const ids = destinationIds(caps({}), viewer)
      expect(ids).toEqual(['pulse', 'site', 'setup'])
    }
    // The tabs every role had before Studio, as Settings
    expect(tabIds(caps({}), VIEWER)).toEqual(['locales', 'ai', 'environment'])
  })

  it('names a destination visible only when its predicate holds', () => {
    expect(isDestinationVisible('structure', caps(), ADMIN)).toBe(true)
    expect(isDestinationVisible('structure', caps(without('seo')), ADMIN)).toBe(false)
  })
})

describe('Setup tabs', () => {
  it('shows every tab to an admin when every capability is on and people sign in', () => {
    expect(tabIds(caps(ALL_FEATURES, 'token'), ADMIN)).toEqual(SETUP_TABS.map((t) => t.id))
  })

  const byCapability: [SetupTabId, string][] = [
    ['collections', 'runtimeSchema'],
    ['integrations', 'webhookDeliveries'],
    ['checkpoints', 'checkpoints'],
  ]
  for (const [tab, feature] of byCapability) {
    it(`hides ${tab} without the ${feature} capability`, () => {
      expect(tabIds(caps(without(feature), 'token'), ADMIN)).not.toContain(tab)
    })
  }

  it('hides Collections & schema from a signed-in editor, not from a site without sign-in', () => {
    expect(tabIds(caps(ALL_FEATURES, 'token'), EDITOR)).not.toContain('collections')
    expect(tabIds(caps(), NO_LOGIN)).toContain('collections')
  })

  it('shows Locales and AI provider to every role, as Settings was before Studio', () => {
    for (const viewer of [ADMIN, EDITOR, VIEWER, NO_LOGIN]) {
      expect(tabIds(caps({}), viewer)).toContain('locales')
      expect(tabIds(caps({}), viewer)).toContain('ai')
    }
  })

  it('shows People to an admin when auth mode is token or oidc', () => {
    expect(tabIds(caps(ALL_FEATURES, 'token'), ADMIN)).toContain('people')
    expect(tabIds(caps(ALL_FEATURES, 'oidc'), ADMIN)).toContain('people')
  })

  it('hides People from an editor, and from everyone when auth mode is none', () => {
    expect(tabIds(caps(ALL_FEATURES, 'token'), EDITOR)).not.toContain('people')
    expect(tabIds(caps(ALL_FEATURES, 'oidc'), EDITOR)).not.toContain('people')
    expect(tabIds(caps(ALL_FEATURES, 'none'), NO_LOGIN)).not.toContain('people')
  })

  it('always shows Environment', () => {
    expect(tabIds(caps({}), VIEWER)).toContain('environment')
  })
})

// ---------------------------------------------------------------------------
// The router: a hidden or unknown route renders the not-found screen
// ---------------------------------------------------------------------------

interface FakeSite {
  features: Record<string, string>
  authMode: AuthMode
  /** The signed-in user's role; with auth mode none the user is an anonymous admin */
  role?: Role | undefined
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installApi(site: FakeSite): void {
  const loginRequired = site.authMode !== 'none'
  const routes: Record<string, () => Response> = {
    '/api/auth/capabilities': () =>
      json({ auth_mode: site.authMode, login_required: loginRequired }),
    '/api/auth/me': () => json({ email: 'person@example.test', roles: [site.role ?? 'admin'] }),
    '/api/capabilities': () => json(caps(site.features, site.authMode)),
    '/api/collections': () => json({ collections: [] }),
    '/api/locks': () => json({ locks: [] }),
    '/api/settings/llm': () => json({ ...UNCONFIGURED_LLM, provider: 'anthropic' }),
    '/api/settings/locales': () =>
      json({ defaultLocale: 'en', supportedLocales: ['en', 'nb'], source: 'config' }),
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const route = routes[url.split('?')[0] ?? '']
    return route ? route() : json({ error: 'not found' }, 404)
  })
}

function renderStudio(path: string): void {
  render(
    createElement(Studio, {
      makeRouter: (routes) => createMemoryRouter(routes, { initialEntries: [path] }),
    }),
  )
}

async function expectNotFound(): Promise<void> {
  expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to Pulse' })).toHaveAttribute('href', '/')
  // The breadcrumbs name nothing but the not-found screen
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
  expect(
    within(crumbs)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Not found'])
  expect(within(crumbs).queryAllByRole('link')).toEqual([])
}

describe('routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the not-found screen for an unknown path', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'none' })
    renderStudio('/no-such-screen')
    await expectNotFound()
  })

  it('renders the not-found screen for an old Studio path', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'none' })
    renderStudio('/settings')
    await expectNotFound()
  })

  it('does not register Media without the media capability', async () => {
    installApi({ features: without('media'), authMode: 'none' })
    renderStudio('/media')
    await expectNotFound()
  })

  it('does not register Structure without the seo capability', async () => {
    installApi({ features: without('seo'), authMode: 'none' })
    renderStudio('/structure/graph')
    await expectNotFound()
  })

  it('does not register People when auth mode is none', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'none' })
    renderStudio('/setup/people')
    await expectNotFound()
  })

  it('does not register People for a signed-in editor', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'token', role: 'editor' })
    renderStudio('/setup/people')
    await expectNotFound()
  })

  it('shows AI provider to an editor read-only, as the API refuses the writes', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'token', role: 'editor' })
    renderStudio('/setup/ai')
    expect(
      await screen.findByText('AI help is off. An admin can add a key to turn it on.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  it('shows the locales to an editor read-only', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'token', role: 'editor' })
    renderStudio('/setup/locales')
    expect(await screen.findByText('Only admins change the locales.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Locale' })).toBeNull()
  })

  it('lets an admin change the AI provider', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'token', role: 'admin' })
    renderStudio('/setup/ai')
    expect((await screen.findAllByRole('button', { name: 'Turn on' })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/An admin can add a key/)).toBeNull()
  })

  it('renders a visible Setup tab', async () => {
    installApi({ features: ALL_FEATURES, authMode: 'none' })
    renderStudio('/setup/environment')
    expect(await screen.findByRole('heading', { name: 'Environment' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nothing here' })).toBeNull()
  })
})
