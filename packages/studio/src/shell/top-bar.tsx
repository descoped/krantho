import { Menu, Search } from 'lucide-react'
import type { ReactElement } from 'react'
import { IconButton } from '../ui/button.js'
import { Breadcrumbs } from './breadcrumbs.js'
import './top-bar.css'

export interface TopBarProps {
  /** Below 960px the navigation is a drawer, opened from the menu button */
  showMenuButton: boolean
  menuOpen: boolean
  onOpenMenu: () => void
  onOpenPalette: () => void
}

/** ⌘ on Apple platforms, Ctrl elsewhere */
function shortcutLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘K' : 'Ctrl K'
}

/** The 56px bar: the menu button on narrow screens, the breadcrumbs and the palette button */
export function TopBar({
  showMenuButton,
  menuOpen,
  onOpenMenu,
  onOpenPalette,
}: TopBarProps): ReactElement {
  return (
    <header className="top-bar">
      {showMenuButton && (
        <IconButton
          icon={Menu}
          label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="studio-nav"
          onClick={onOpenMenu}
        />
      )}
      <Breadcrumbs />
      <button
        type="button"
        className="top-bar-command"
        aria-label="Search or command"
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        onClick={onOpenPalette}
      >
        <Search className="top-bar-command-icon" aria-hidden="true" />
        <span className="top-bar-command-label">Search or command</span>
        <kbd className="top-bar-command-key">{shortcutLabel()}</kbd>
      </button>
    </header>
  )
}
