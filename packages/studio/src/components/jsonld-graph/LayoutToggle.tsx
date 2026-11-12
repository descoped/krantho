import { GitBranch, Network } from 'lucide-react'
import { useState } from 'react'

export type GraphLayout = 'tree' | 'canvas'

const STORAGE_KEY = 'krantho:graphLayout'

interface LayoutToggleProps {
  value: GraphLayout
  onChange: (layout: GraphLayout) => void
}

/**
 * Single toggle button that switches between Tree and Canvas.
 * Shows the label of the view you'll switch TO (not the current view).
 */
export function LayoutToggle({ value, onChange }: LayoutToggleProps): React.ReactElement {
  const nextLayout = value === 'tree' ? 'canvas' : 'tree'
  const label = nextLayout === 'canvas' ? 'Canvas' : 'Tree'
  const Icon = nextLayout === 'canvas' ? Network : GitBranch

  return (
    <button
      type="button"
      className="graph-layout-toggle-btn"
      onClick={() => onChange(nextLayout)}
      title={`Switch to ${label} view`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

/** Hook for persisting graph layout choice to localStorage. */
export function useGraphLayout(): [GraphLayout, (layout: GraphLayout) => void] {
  const [layout, setLayout] = useState<GraphLayout>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'canvas' ? 'canvas' : 'tree'
    } catch {
      return 'tree'
    }
  })

  const setAndPersist = (next: GraphLayout): void => {
    setLayout(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable
    }
  }

  return [layout, setAndPersist]
}
