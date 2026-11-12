import type { LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import './chip.css'

/**
 * Neutral and accent labels; success and warning carry the status model's Live
 * and Unpublished changes; danger marks what is over a limit
 */
export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/** The classes of a chip — also for a control that looks like one */
export function chipClass(tone: ChipTone = 'neutral', extra?: string | undefined): string {
  return ['ui-chip', `ui-chip--${tone}`, extra].filter(Boolean).join(' ')
}

export interface ChipProps {
  tone?: ChipTone | undefined
  icon?: LucideIcon | undefined
  children: ReactNode
}

/** A small label: a role, an event, a state */
export function Chip({ tone = 'neutral', icon: Icon, children }: ChipProps): ReactElement {
  return (
    <span className={chipClass(tone)}>
      {Icon && <Icon className="ui-chip-icon" aria-hidden="true" />}
      {children}
    </span>
  )
}
