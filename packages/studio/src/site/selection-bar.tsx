import { CircleCheck, Trash2, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '../ui/button.js'
import type { BulkAction } from './bulk-modal.js'

export interface SelectionBarProps {
  count: number
  /** Publish is offered to editors */
  canPublish: boolean
  /** Delete is offered to admins */
  canDelete: boolean
  onAction: (action: BulkAction) => void
  onClear: () => void
}

/** What the selected rows can have done to them, with how many are selected */
export function SelectionBar({
  count,
  canPublish,
  canDelete,
  onAction,
  onClear,
}: SelectionBarProps): ReactElement {
  return (
    <section className="site-selection" aria-label="Selection">
      <p className="site-selection-count">
        <span className="site-shown-number">{count}</span> selected
      </p>
      <div className="site-selection-actions">
        {canPublish && (
          <Button
            size="sm"
            variant="primary"
            icon={CircleCheck}
            onClick={() => onAction('publish')}
          >
            Publish
          </Button>
        )}
        {canDelete && (
          <Button size="sm" icon={Trash2} onClick={() => onAction('delete')}>
            Delete
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={X} onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </section>
  )
}
