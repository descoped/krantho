import {
  type CSSProperties,
  lazy,
  type ReactElement,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router'
import { AssistantProvider, useAssistantToggle } from '../components/assistant/AssistantProvider.js'
import { useMediaQuery } from '../hooks/use-media-query.js'
import { NAV_WIDTH, useNavPreferences } from '../hooks/use-nav-preferences.js'
import { useAuth } from '../lib/auth.js'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { ToastProvider } from '../ui/toast.js'
import { CommandPalette } from './command-palette.js'
import { Nav, type NavMode } from './nav.js'
import { MissingScreenProvider } from './not-found.js'
import { TopBar } from './top-bar.js'
import './app-shell.css'

const AssistantPanel = lazy(() =>
  import('../components/assistant/AssistantPanel.js').then((m) => ({ default: m.AssistantPanel })),
)

/** What the shell offers the screen it renders */
interface ShellOutlet {
  /** A screen changed documents: the site tree reads them again */
  contentChanged: () => void
}

function noChange(): void {}

/** Tell the shell a screen changed documents, so the site tree shows their new state */
export function useContentChanged(): () => void {
  return useOutletContext<ShellOutlet | undefined>()?.contentChanged ?? noChange
}

/** Below this width the navigation is an off-canvas drawer */
const DRAWER_QUERY = '(max-width: 959.98px)'

/** The assistant panel, loaded the first time it is opened and kept mounted after */
function AssistantSlot(): ReactElement | null {
  const assistant = useAssistantToggle()
  if (!assistant?.opened) return null
  return (
    <Suspense fallback={null}>
      <AssistantPanel />
    </Suspense>
  )
}

/** ⌘K or Ctrl+K toggles the palette from anywhere in Studio */
function usePaletteShortcut(toggle: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])
}

/** The drawer's open state: closed on navigation and when the viewport widens */
function useDrawer(narrow: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // biome-ignore lint/correctness/useExhaustiveDependencies: a navigation closes the drawer
  useEffect(() => setOpen(false), [pathname, narrow])
  return [open, setOpen]
}

interface ShellState {
  mode: NavMode
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleCollapsed: () => void
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
  treeRevision: number
  contentChanged: () => void
  preferences: ReturnType<typeof useNavPreferences>
}

/**
 * The shell's state. Opening the palette closes the drawer first, so only one
 * focus trap is ever active.
 */
function useShellState(): ShellState {
  const narrow = useMediaQuery(DRAWER_QUERY)
  const preferences = useNavPreferences()
  const [drawerOpen, setDrawerOpen] = useDrawer(narrow)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [treeRevision, setTreeRevision] = useState(0)

  const openPalette = useCallback(() => {
    setDrawerOpen(false)
    setPaletteOpen(true)
  }, [setDrawerOpen])
  const togglePalette = useCallback(() => {
    setDrawerOpen(false)
    setPaletteOpen((open) => !open)
  }, [setDrawerOpen])
  usePaletteShortcut(togglePalette)

  return {
    mode: narrow ? 'drawer' : preferences.collapsed ? 'collapsed' : 'expanded',
    drawerOpen,
    openDrawer: useCallback(() => setDrawerOpen(true), [setDrawerOpen]),
    closeDrawer: useCallback(() => setDrawerOpen(false), [setDrawerOpen]),
    toggleCollapsed: () => preferences.setCollapsed(!preferences.collapsed),
    paletteOpen,
    openPalette,
    closePalette: useCallback(() => setPaletteOpen(false), []),
    treeRevision,
    contentChanged: useCallback(() => setTreeRevision((revision) => revision + 1), []),
    preferences,
  }
}

function ShellFrame(): ReactElement {
  const shell = useShellState()
  return (
    <div
      className="shell"
      data-nav={shell.mode}
      style={{ '--nav-width': `${shell.preferences.width}px` } as CSSProperties}
    >
      <a className="shell-skip" href="#studio-main">
        Skip to content
      </a>
      <Nav
        mode={shell.mode}
        drawerOpen={shell.drawerOpen}
        onCloseDrawer={shell.closeDrawer}
        onToggleCollapsed={shell.toggleCollapsed}
        width={shell.preferences.width}
        onResize={shell.preferences.setWidth}
        onResetWidth={() => shell.preferences.setWidth(NAV_WIDTH.fallback)}
        treeRevision={shell.treeRevision}
        closedGroups={shell.preferences.closedGroups}
        onToggleGroup={shell.preferences.toggleGroup}
      />
      {shell.mode === 'drawer' && shell.drawerOpen && (
        <div className="shell-scrim" aria-hidden="true" onClick={shell.closeDrawer} />
      )}
      <div className="shell-column">
        <TopBar
          showMenuButton={shell.mode === 'drawer'}
          menuOpen={shell.drawerOpen}
          onOpenMenu={shell.openDrawer}
          onOpenPalette={shell.openPalette}
        />
        <main id="studio-main" className="shell-page" tabIndex={-1}>
          <Suspense fallback={<div className="loading">Loading…</div>}>
            <Outlet context={{ contentChanged: shell.contentChanged } satisfies ShellOutlet} />
          </Suspense>
        </main>
      </div>
      <CommandPalette
        open={shell.paletteOpen}
        onClose={shell.closePalette}
        onContentChanged={shell.contentChanged}
      />
      <AssistantSlot />
    </div>
  )
}

/**
 * Studio's frame around every screen: the navigation, the top bar, the ⌘K
 * palette, the toasts and — when the site enables it — the assistant.
 */
export function AppShell(): ReactElement {
  const { isAuthenticated, user } = useAuth()
  const caps = useCapabilities()
  // Only for a signed-in user: the API refuses an anonymous reader
  const assistantAvailable = isEnabled(caps, 'assistant') && isAuthenticated && user !== null
  const frame = (
    <ToastProvider>
      <MissingScreenProvider>
        <ShellFrame />
      </MissingScreenProvider>
    </ToastProvider>
  )
  return assistantAvailable ? <AssistantProvider>{frame}</AssistantProvider> : frame
}
