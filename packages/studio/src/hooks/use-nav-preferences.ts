import { useCallback } from 'react'
import { readLayout, widthOf } from '../lib/stored-layout.js'
import { useStoredLayout } from './use-stored-layout.js'

/** Studio's own key for the navigation's remembered layout */
const STORAGE_KEY = 'krantho-studio-nav'

/** The expanded navigation's width in pixels: its bounds, and the default, which is `--nav-width` */
export const NAV_WIDTH = { min: 200, max: 360, fallback: 236 } as const

export interface NavPreferences {
  /** The navigation shows icons only */
  collapsed: boolean
  /** The expanded navigation's width, in pixels */
  width: number
  /** Site tree groups the viewer closed, by collection name */
  closedGroups: readonly string[]
}

function read(): NavPreferences {
  const { collapsed, width, closedGroups } = readLayout(STORAGE_KEY)
  return {
    collapsed: collapsed === true,
    width: widthOf(width, NAV_WIDTH, NAV_WIDTH.fallback),
    closedGroups: Array.isArray(closedGroups)
      ? closedGroups.filter((name): name is string => typeof name === 'string')
      : [],
  }
}

/** The navigation's collapsed state, width and closed tree groups, remembered per browser */
export function useNavPreferences(): NavPreferences & {
  setCollapsed: (collapsed: boolean) => void
  setWidth: (width: number) => void
  toggleGroup: (name: string) => void
} {
  const [preferences, update] = useStoredLayout(STORAGE_KEY, read)

  const setCollapsed = useCallback(
    (collapsed: boolean) => update((current) => ({ ...current, collapsed })),
    [update],
  )
  const setWidth = useCallback(
    (width: number) => update((current) => ({ ...current, width })),
    [update],
  )
  const toggleGroup = useCallback(
    (name: string) =>
      update((current) => ({
        ...current,
        closedGroups: current.closedGroups.includes(name)
          ? current.closedGroups.filter((group) => group !== name)
          : [...current.closedGroups, name],
      })),
    [update],
  )

  return { ...preferences, setCollapsed, setWidth, toggleGroup }
}
