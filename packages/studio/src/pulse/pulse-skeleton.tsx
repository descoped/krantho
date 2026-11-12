import './key-figures.css'
import './pulse.css'

import type { ReactElement } from 'react'

function FigureSkeleton(): ReactElement {
  return (
    <div className="pulse-figure">
      <div className="pulse-figure-body">
        <span className="pulse-skeleton pulse-skeleton--label" />
        <span className="pulse-skeleton pulse-skeleton--number" />
        <span className="pulse-skeleton pulse-skeleton--line" />
      </div>
    </div>
  )
}

/** Keys for placeholder rows, which have no identity of their own */
const ROW_KEYS = ['first', 'second', 'third', 'fourth'] as const

function PanelSkeleton({ title, rows }: { title: string; rows: number }): ReactElement {
  return (
    <div className="pulse-panel">
      <div className="pulse-panel-head">
        <p className="pulse-panel-title">{title}</p>
      </div>
      {ROW_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="pulse-skeleton-row">
          <span className="pulse-skeleton pulse-skeleton--line" />
          <span className="pulse-skeleton pulse-skeleton--short" />
        </div>
      ))}
    </div>
  )
}

/** Pulse's frame while it loads, at the sizes the content takes, so nothing jumps when it arrives */
export function PulseSkeleton(): ReactElement {
  return (
    <div className="pulse-skeleton-frame" aria-hidden="true">
      <div className="pulse-figures">
        <FigureSkeleton />
        <FigureSkeleton />
        <FigureSkeleton />
      </div>
      <div className="pulse-columns">
        <PanelSkeleton title="Needs attention" rows={3} />
        <PanelSkeleton title="Collections" rows={3} />
      </div>
      <PanelSkeleton title="Recent activity" rows={4} />
    </div>
  )
}
