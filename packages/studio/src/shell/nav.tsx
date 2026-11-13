import { X } from 'lucide-react'
import { type ReactElement, type RefObject, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useFocusTrap } from '../hooks/use-focus-trap.js'
import { NAV_WIDTH } from '../hooks/use-nav-preferences.js'
import { useAuth } from '../lib/auth.js'
import { useCapabilities } from '../lib/capabilities.js'
import { IconButton } from '../ui/button.js'
import { ResizeHandle } from '../ui/resize-handle.js'
import { destinationOf, visibleDestinations } from './destinations.js'
import { NavFooter } from './nav-footer.js'
import { SiteTree } from './site-tree.js'
import './nav.css'

/** Expanded (236px unless resized), collapsed to icons (66px), or an off-canvas drawer below 960px */
export type NavMode = 'expanded' | 'collapsed' | 'drawer'

export interface NavProps {
  mode: NavMode
  /** In drawer mode: whether the drawer is open */
  drawerOpen: boolean
  onCloseDrawer: () => void
  onToggleCollapsed: () => void
  /** The expanded navigation's width, in pixels, and how a drag or a key changes it */
  width: number
  onResize: (width: number) => void
  onResetWidth: () => void
  treeRevision: number
  closedGroups: readonly string[]
  onToggleGroup: (name: string) => void
}

/** krantho's mark: a lowercase k drawn as a small content graph, as on krantho.com */
function BrandMark(): ReactElement {
  return (
    <svg className="nav-brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
        <path d="M9 4.5v23" />
        <path d="M9 17.5 23 7" />
        <path d="M14.5 13.4 23.5 27" />
      </g>
      <g fill="currentColor">
        <circle cx="9" cy="4.5" r="2.6" />
        <circle cx="9" cy="27.5" r="2.6" />
        <circle cx="23" cy="7" r="2.6" />
        <circle cx="23.5" cy="27" r="2.6" />
      </g>
      <circle cx="9" cy="17.5" r="3.6" fill="var(--color-accent)" />
    </svg>
  )
}

function Destinations(): ReactElement {
  const caps = useCapabilities()
  const { user, loginRequired } = useAuth()
  const { pathname } = useLocation()
  const active = destinationOf(pathname)
  const viewer = { roles: user?.roles ?? [], loginRequired }

  return (
    <ul className="nav-destinations" aria-label="Destinations">
      {visibleDestinations(caps, viewer).map((destination) => {
        const Icon = destination.icon
        const current =
          pathname === destination.path ? 'page' : active === destination.id ? 'true' : undefined
        return (
          <li key={destination.id}>
            <Link to={destination.path} className="nav-item" aria-current={current}>
              <Icon className="nav-item-icon" aria-hidden="true" />
              <span className="nav-item-label">{destination.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The open drawer is modal: focus stays inside, Esc closes it */
function useModalDrawer(
  containerRef: RefObject<HTMLDivElement | null>,
  modal: boolean,
  onClose: () => void,
): void {
  useFocusTrap(containerRef, modal)
  useEffect(() => {
    if (!modal) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [modal, onClose])
}

/** Esc dismisses the collapsed navigation's tooltip, focus staying where it is (WCAG 1.4.13) */
function useDismissibleTooltips(containerRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const dismissed = new Set<Element>()
    const rearm = (event: MouseEvent | FocusEvent): void => {
      if (!(event.target instanceof Element)) return
      const item = event.target.closest('.nav-item')
      const into = event.relatedTarget
      if (!item || (into instanceof Node && item.contains(into))) return
      if (dismissed.delete(item)) item.removeAttribute('data-tip-dismissed')
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      // Only the collapsed rail shows tooltips
      if (event.key !== 'Escape' || container.dataset.mode !== 'collapsed') return
      for (const item of container.querySelectorAll('.nav-item:hover, .nav-item:focus')) {
        item.setAttribute('data-tip-dismissed', '')
        dismissed.add(item)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    container.addEventListener('mouseout', rearm)
    container.addEventListener('focusout', rearm)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('mouseout', rearm)
      container.removeEventListener('focusout', rearm)
    }
  }, [containerRef])
}

function NavHeader({ onCloseDrawer }: { onCloseDrawer: (() => void) | null }): ReactElement {
  return (
    <div className="nav-header">
      <Link to="/" className="nav-brand">
        <BrandMark />
        <span className="nav-brand-word">
          krantho <span className="nav-brand-studio">studio</span>
        </span>
      </Link>
      {onCloseDrawer && <IconButton icon={X} label="Close navigation" onClick={onCloseDrawer} />}
    </div>
  )
}

/** The navigation: brand, the five destinations, the site tree and the footer */
export function Nav(props: NavProps): ReactElement {
  const { mode, drawerOpen, onCloseDrawer } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const isDrawer = mode === 'drawer'
  const modal = isDrawer && drawerOpen
  useModalDrawer(containerRef, modal, onCloseDrawer)
  useDismissibleTooltips(containerRef)
  // The open drawer is a modal dialog over the page
  const dialog = modal
    ? ({ role: 'dialog', 'aria-modal': true, 'aria-label': 'Navigation' } as const)
    : {}

  return (
    <div
      ref={containerRef}
      id="studio-nav"
      className="shell-nav"
      data-mode={mode}
      data-open={modal}
      inert={isDrawer && !drawerOpen}
      {...dialog}
    >
      <nav className="nav" aria-label="Studio">
        <NavHeader onCloseDrawer={isDrawer ? onCloseDrawer : null} />
        <div className="nav-scroll">
          <Destinations />
          {mode !== 'collapsed' && (
            <SiteTree
              revision={props.treeRevision}
              closedGroups={props.closedGroups}
              onToggleGroup={props.onToggleGroup}
            />
          )}
        </div>
        <NavFooter mode={mode} onToggleCollapsed={props.onToggleCollapsed} />
      </nav>
      {mode === 'expanded' && (
        <ResizeHandle
          label="Resize navigation"
          value={props.width}
          min={NAV_WIDTH.min}
          max={NAV_WIDTH.max}
          grows="right"
          onChange={props.onResize}
          onReset={props.onResetWidth}
          controls="studio-nav"
        />
      )}
    </div>
  )
}
