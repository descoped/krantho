import { RotateCw, TriangleAlert } from 'lucide-react'
import { type ReactElement, type RefObject, useId } from 'react'
import { Button } from '../ui/button.js'
import { EmptyState } from '../ui/empty-state.js'

export interface LoadErrorProps {
  title: string
  message: string
  onRetry: () => void
  /** The panel, labelled by its title: where focus goes when an action ends here */
  panelRef?: RefObject<HTMLDivElement | null> | undefined
}

/** A screen whose required data could not be read: what failed, and Try again */
export function LoadError({ title, message, onRetry, panelRef }: LoadErrorProps): ReactElement {
  const titleId = useId()
  return (
    <div
      ref={panelRef}
      className="site-panel site-focus-target"
      role="alert"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <EmptyState
        icon={TriangleAlert}
        title={title}
        titleId={titleId}
        action={
          <Button icon={RotateCw} onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {message}
      </EmptyState>
    </div>
  )
}
