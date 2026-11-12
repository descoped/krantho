import { useCallback, useState } from 'react'
import { NOTHING_SELECTED, type PanelSelection, sameSelection } from './selection.js'

/** What the side panel shows, and how the canvas and the panel change it */
export interface PanelSelectionControl {
  selection: PanelSelection
  /**
   * Show this in the panel. `focusPanel` moves focus to the panel's heading —
   * for a change made from inside the panel, whose control may be swapped away
   */
  select: (next: PanelSelection, focusPanel?: boolean | undefined) => void
  /** Bumped each time the panel's heading should take focus */
  focusTick: number
}

export function usePanelSelection(): PanelSelectionControl {
  const [selection, setSelection] = useState<PanelSelection>(NOTHING_SELECTED)
  const [focusTick, setFocusTick] = useState(0)
  const select = useCallback((next: PanelSelection, focusPanel?: boolean | undefined) => {
    setSelection((current) => (sameSelection(current, next) ? current : next))
    if (focusPanel) setFocusTick((tick) => tick + 1)
  }, [])
  return { selection, select, focusTick }
}
