import { type KeyboardEvent, type ReactElement, useRef } from 'react'
import { useNavigate } from 'react-router'
import './tabs.css'

/** A tab that is a route: its id, its path, and its label */
export interface RouteTab {
  id: string
  path: string
  label: string
}

export interface RouteTabsProps {
  /** The tab list's accessible name */
  label: string
  tabs: readonly RouteTab[]
  current: string
  /** The element id of a tab: what its panel is labelled by */
  tabId: (id: string) => string
  /** The element id of the panel every tab controls */
  panelId: string
}

/** How far each key moves the selection; Home and End go to the ends */
const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 }

function nextIndex(key: string, index: number, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEPS[key]
  return step === undefined ? null : (index + step + count) % count
}

/**
 * Tabs whose panels are routes (the APG tabs pattern, activated on focus):
 * the open tab is the list's one tab stop, the arrow keys, Home and End move
 * to another tab and open it, and the address keeps the open tab.
 */
export function RouteTabs({ label, tabs, current, tabId, panelId }: RouteTabsProps): ReactElement {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  function open(tab: RouteTab, focus: boolean): void {
    if (tab.id !== current) void navigate(tab.path)
    if (focus) listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(tab.id))}`)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((tab) => tab.id === current)
    const next = nextIndex(event.key, index, tabs.length)
    const tab = next === null ? undefined : tabs[next]
    if (!tab) return
    event.preventDefault()
    open(tab, true)
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="ui-tabs" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={tabId(tab.id)}
          type="button"
          role="tab"
          className="ui-tab"
          aria-selected={tab.id === current}
          aria-controls={panelId}
          tabIndex={tab.id === current ? 0 : -1}
          onClick={() => open(tab, false)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
