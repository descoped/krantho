import type { LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import './empty-state.css'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  /** An id for the title, so a container can be labelled by it */
  titleId?: string | undefined
  /** What the space would hold, and why it is empty */
  children?: ReactNode
  /** A next step, when there is one */
  action?: ReactNode
}

/** A calm placeholder where a list or a screen has nothing to show */
export function EmptyState({
  icon: Icon,
  title,
  titleId,
  children,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <div className="ui-empty-state">
      <span className="ui-empty-state-icon" aria-hidden="true">
        <Icon />
      </span>
      <p id={titleId} className="ui-empty-state-title">
        {title}
      </p>
      {children && <div className="ui-empty-state-body">{children}</div>}
      {action && <div className="ui-empty-state-action">{action}</div>}
    </div>
  )
}
