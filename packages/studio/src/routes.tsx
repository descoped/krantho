import { lazy, type ReactElement, type ReactNode, useEffect, useMemo, useState } from 'react'
import { createBrowserRouter, Navigate, type RouteObject, RouterProvider } from 'react-router'
import { AuthProvider, useAuth } from './lib/auth.js'
import {
  CapabilitiesContext,
  fetchCapabilities,
  type RuntimeCapabilities,
  useCapabilities,
} from './lib/capabilities.js'
import { LAYOUT_COLLECTION } from './lib/paths.js'
import { Login } from './pages/Login.js'
import { AppShell } from './shell/app-shell.js'
import {
  type Destination,
  type DestinationId,
  isDestinationVisible,
  type SetupTabId,
  STRUCTURE_TABS,
  type Viewer,
  visibleSetupTabs,
} from './shell/destinations.js'
import { NOT_FOUND, NotFound } from './shell/not-found.js'

// ---------------------------------------------------------------------------
// Screens load their own chunk on navigation; the shell stays static so it never flashes.
// ---------------------------------------------------------------------------

const PulsePage = lazy(() =>
  import('./pulse/pulse-page.js').then((m) => ({ default: m.PulsePage })),
)
const SiteOverview = lazy(() =>
  import('./site/site-overview.js').then((m) => ({ default: m.SiteOverview })),
)
const CollectionPage = lazy(() =>
  import('./site/collection-view.js').then((m) => ({ default: m.CollectionPage })),
)
const EditorPage = lazy(() =>
  import('./editor/editor-page.js').then((m) => ({ default: m.EditorPage })),
)
const StructurePage = lazy(() =>
  import('./structure/structure-page.js').then((m) => ({ default: m.StructurePage })),
)
const MediaPage = lazy(() =>
  import('./media/media-page.js').then((m) => ({ default: m.MediaPage })),
)
const ImageEditorPage = lazy(() =>
  import('./media/image-editor.js').then((m) => ({ default: m.ImageEditorPage })),
)
const SetupPage = lazy(() =>
  import('./setup/setup-page.js').then((m) => ({ default: m.SetupPage })),
)
const SITE_ROUTES: RouteObject[] = [
  { path: 'site', element: <SiteOverview /> },
  // The globals have their own editor under `layout/`, and no list of their own
  { path: `site/${LAYOUT_COLLECTION}`, element: <NotFound />, handle: NOT_FOUND },
  { path: 'site/:collection', element: <CollectionPage /> },
  { path: 'site/:collection/:slug', element: <EditorPage /> },
  { path: 'new/:collection', element: <EditorPage /> },
  { path: 'layout/:slug', element: <EditorPage collection={LAYOUT_COLLECTION} /> },
]

/** Structure: one route per tab (§6), `/structure` opening the first */
const STRUCTURE_ROUTES: RouteObject[] = [
  { path: 'structure', element: <Navigate replace to={STRUCTURE_TABS[0]?.path ?? '/'} /> },
  ...STRUCTURE_TABS.map((tab) => ({
    path: tab.path.slice(1),
    element: <StructurePage tab={tab.id} />,
  })),
]

const MEDIA_ROUTES: RouteObject[] = [
  { path: 'media', element: <MediaPage /> },
  { path: 'media/:id/edit', element: <ImageEditorPage /> },
]

/** Setup: one route per visible tab, `/setup` opening the first; a hidden tab is not registered */
function setupRoutes(tabs: readonly Destination<SetupTabId>[]): RouteObject[] {
  const first = tabs[0]
  if (!first) return []
  return [
    { path: 'setup', element: <Navigate replace to={first.path} /> },
    ...tabs.map((tab) => ({
      path: tab.path.slice(1),
      element: <SetupPage tab={tab.id} tabs={tabs} />,
    })),
  ]
}

/** What decides which routes exist: the site's capabilities and the viewer */
export interface Access {
  caps: RuntimeCapabilities
  viewer: Viewer
}

/**
 * Studio's route table. A destination or Setup tab this site or viewer does not
 * have is not registered, so its paths fall through to the not-found screen.
 */
export function studioRoutes({ caps, viewer }: Access): RouteObject[] {
  const shown = (id: DestinationId): boolean => isDestinationVisible(id, caps, viewer)
  const children: RouteObject[] = [
    { index: true, element: <PulsePage /> },
    ...SITE_ROUTES,
    ...(shown('structure') ? STRUCTURE_ROUTES : []),
    ...(shown('media') ? MEDIA_ROUTES : []),
    ...(shown('setup') ? setupRoutes(visibleSetupTabs(caps, viewer)) : []),
    { path: '*', element: <NotFound />, handle: NOT_FOUND },
  ]
  return [{ path: '/', element: <AppShell />, children }]
}

type StudioRouter = ReturnType<typeof createBrowserRouter>

/** Builds the router from the route table — the browser's history, under `/studio`, by default */
export type MakeRouter = (routes: RouteObject[]) => StudioRouter

function browserRouter(routes: RouteObject[]): StudioRouter {
  return createBrowserRouter(routes, { basename: '/studio' })
}

function Loading(): ReactElement {
  return <div className="loading">Loading…</div>
}

function CapabilitiesProvider({ children }: { children: ReactNode }): ReactElement {
  const [caps, setCaps] = useState<RuntimeCapabilities | null>(null)
  useEffect(() => {
    void fetchCapabilities().then(setCaps)
  }, [])
  if (!caps) return <Loading />
  return <CapabilitiesContext.Provider value={caps}>{children}</CapabilitiesContext.Provider>
}

function SignedInRouter({ makeRouter }: { makeRouter: MakeRouter }): ReactElement {
  const { user, loginRequired } = useAuth()
  const caps = useCapabilities()
  const roles = user?.roles
  const router = useMemo(
    () => makeRouter(studioRoutes({ caps, viewer: { roles: roles ?? [], loginRequired } })),
    [makeRouter, caps, roles, loginRequired],
  )
  useEffect(() => () => router.dispose(), [router])
  return <RouterProvider router={router} />
}

function Gate({ makeRouter }: { makeRouter: MakeRouter }): ReactElement {
  const { isLoading, isAuthenticated, loginRequired } = useAuth()
  if (isLoading) return <Loading />
  if (loginRequired && !isAuthenticated) return <Login />
  return <SignedInRouter makeRouter={makeRouter} />
}

/** Studio: sign-in, the site's capabilities, then the routes they allow */
export function Studio({ makeRouter = browserRouter }: { makeRouter?: MakeRouter }): ReactElement {
  return (
    <AuthProvider>
      <CapabilitiesProvider>
        <Gate makeRouter={makeRouter} />
      </CapabilitiesProvider>
    </AuthProvider>
  )
}
