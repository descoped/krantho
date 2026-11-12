import type { ReactElement } from 'react'
import './meter.css'

export type MeterTone = 'live' | 'ahead' | 'danger' | 'muted'

export interface MeterSegment {
  value: number
  tone: MeterTone
}

export interface MeterProps {
  /** The parts, in order; together they make up `max` */
  segments: readonly MeterSegment[]
  max: number
}

/**
 * A thin bar split into parts — decorative: the text beside it says the
 * numbers, so it is hidden from assistive technology
 */
export function Meter({ segments, max }: MeterProps): ReactElement {
  return (
    <span className="ui-meter" aria-hidden="true">
      {max > 0 &&
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.tone}
              className={`ui-meter-part ui-meter-part--${segment.tone}`}
              style={{ flexGrow: segment.value / max }}
            />
          ))}
    </span>
  )
}
