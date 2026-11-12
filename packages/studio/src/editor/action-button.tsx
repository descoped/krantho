import type { LucideIcon } from 'lucide-react'
import { type ReactElement, type ReactNode, useId } from 'react'
import { Button, type ButtonVariant } from '../ui/button.js'

export interface ActionButtonProps {
  /** Why the action cannot run now; null when it can */
  reason: string | null
  variant?: ButtonVariant | undefined
  size?: 'sm' | undefined
  icon?: LucideIcon | undefined
  onClick: () => void
  children: ReactNode
}

/**
 * An editor action — Save draft, Publish, Enrich. When it cannot act it stays
 * focusable and says why (`aria-disabled`), so a click never drops focus to the page
 */
export function ActionButton({
  reason,
  variant,
  size,
  icon,
  onClick,
  children,
}: ActionButtonProps): ReactElement {
  const reasonId = useId()
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={icon}
        onClick={reason ? undefined : onClick}
        aria-disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        title={reason ?? undefined}
      >
        {children}
      </Button>
      {reason && (
        <span id={reasonId} hidden>
          {reason}
        </span>
      )}
    </>
  )
}
