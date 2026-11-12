import { useCallback } from 'react'
import { useStoredLayout } from '../hooks/use-stored-layout.js'
import { readLayout, widthOf } from '../lib/stored-layout.js'

/** Studio's own key for the side panel's remembered layout, kept for every document */
const STORAGE_KEY = 'krantho-studio-panel'

/** The side panel's width in pixels: its bounds, and the default, which is `--panel-width` */
export const PANEL_WIDTH = { min: 300, max: 640, fallback: 380 } as const

export interface PanelLayout {
  /** The panel is hidden, and the canvas has the whole width */
  collapsed: boolean
  width: number
}

function read(): PanelLayout {
  const { collapsed, width } = readLayout(STORAGE_KEY)
  return { collapsed: collapsed === true, width: widthOf(width, PANEL_WIDTH, PANEL_WIDTH.fallback) }
}

/** The side panel's collapsed state and width, remembered per browser */
export function usePanelLayout(): PanelLayout & {
  setCollapsed: (collapsed: boolean) => void
  setWidth: (width: number) => void
} {
  const [layout, setLayout] = useStoredLayout(STORAGE_KEY, read)
  const update = useCallback(
    (change: Partial<PanelLayout>): void => setLayout((current) => ({ ...current, ...change })),
    [setLayout],
  )
  return {
    ...layout,
    setCollapsed: useCallback((collapsed: boolean) => update({ collapsed }), [update]),
    setWidth: useCallback((width: number) => update({ width }), [update]),
  }
}
