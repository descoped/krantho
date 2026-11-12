import type { ReactElement, ReactNode } from 'react'
import { Meter } from '../../ui/meter.js'
import { type LengthState, lengthMeter, lengthWords } from './findability-model.js'

export interface LengthMeterProps {
  label: string
  length: number
  state: LengthState
  /** The configured target: a range (the meta description) or a limit (the title) */
  target: { kind: 'range'; min: number; max: number } | { kind: 'limit'; max: number }
  /** A line under the meter: where the text comes from */
  note?: ReactNode | undefined
}

function targetText(target: LengthMeterProps['target']): string {
  return target.kind === 'range' ? `target ${target.min}–${target.max}` : `limit ${target.max}`
}

/**
 * A length against the site's configured limits: the figure, the target, the
 * state in words and a meter — under the target a warning, over it danger
 */
export function LengthMeter({
  label,
  length,
  state,
  target,
  note,
}: LengthMeterProps): ReactElement {
  const { segments, max } = lengthMeter(length, state, target.max)
  return (
    <div className={`side-length side-length--${state}`} data-length-state={state}>
      <div className="side-length-head">
        <span className="side-length-label">{label}</span>
        <span className="side-length-figure">
          {length} chars · {targetText(target)}
        </span>
      </div>
      <Meter segments={segments} max={max} />
      <span className="side-length-state">{lengthWords(state, target.kind)}</span>
      {note && <span className="side-length-note">{note}</span>}
    </div>
  )
}
