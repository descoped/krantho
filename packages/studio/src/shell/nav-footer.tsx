import { Bot, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ReactElement } from 'react'
import { useAssistantToggle } from '../components/assistant/AssistantProvider.js'
import { useAuth } from '../lib/auth.js'
import { IconButton } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import type { NavMode } from './nav.js'
import { ThemeSwitch } from './theme-switch.js'

/** The assistant's launcher, when the site enables the assistant for this viewer */
function AssistantLauncher(): ReactElement | null {
  const assistant = useAssistantToggle()
  if (!assistant) return null
  return (
    <button
      ref={assistant.launcherRef}
      type="button"
      className="nav-item"
      aria-expanded={assistant.open}
      aria-controls={assistant.opened ? 'assistant-panel' : undefined}
      onClick={assistant.toggle}
    >
      <Bot className="nav-item-icon" aria-hidden="true" />
      <span className="nav-item-label">Assistant</span>
    </button>
  )
}

/** The signed-in user and Log out, when the site requires signing in */
function Account({ collapsed }: { collapsed: boolean }): ReactElement | null {
  const auth = useAuth()
  if (!auth.loginRequired) return null
  const role = auth.user?.roles[0] ?? 'viewer'
  return (
    <>
      {auth.user && !collapsed && (
        <div className="nav-user">
          <span className="nav-user-email" title={auth.user.email}>
            {auth.user.email}
          </span>
          <Chip tone={role === 'admin' ? 'accent' : 'neutral'}>{role}</Chip>
        </div>
      )}
      <button type="button" className="nav-item" onClick={() => void auth.logout()}>
        <LogOut className="nav-item-icon" aria-hidden="true" />
        <span className="nav-item-label">Log out</span>
      </button>
    </>
  )
}

export interface NavFooterProps {
  mode: NavMode
  onToggleCollapsed: () => void
}

/** The assistant launcher, the account, the theme switch and the collapse button */
export function NavFooter({ mode, onToggleCollapsed }: NavFooterProps): ReactElement {
  const collapsed = mode === 'collapsed'
  return (
    <div className="nav-footer">
      <AssistantLauncher />
      <Account collapsed={collapsed} />
      <div className="nav-footer-row">
        <ThemeSwitch vertical={collapsed} />
        {mode !== 'drawer' && (
          <IconButton
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="studio-nav"
            size="sm"
            onClick={onToggleCollapsed}
          />
        )}
      </div>
    </div>
  )
}
