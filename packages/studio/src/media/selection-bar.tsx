import { CheckCheck, Trash2, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { Button } from '../ui/button.js'
import { ADMIN_REASON } from './media-model.js'

export interface SelectionBarProps {
  count: number
  /** Deleting several files is the admin's (the bulk route requires it) */
  canDelete: boolean
  onDelete: () => void
  onSelectPage: () => void
  onClear: () => void
}

/** Bulk select's bar: how many are selected, Delete, select the page, clear */
export function SelectionBar(props: SelectionBarProps): ReactElement {
  const deleteReason = props.count === 0 ? 'Select files to delete.' : null
  return (
    <section className="media-selection" aria-label="Selection">
      <p className="media-selection-count" role="status">
        <span className="media-figure">{props.count}</span> selected
      </p>
      <div className="media-actions">
        <ActionButton
          size="sm"
          variant="danger"
          icon={Trash2}
          reason={props.canDelete ? deleteReason : ADMIN_REASON}
          onClick={props.onDelete}
        >
          Delete
        </ActionButton>
        <Button size="sm" variant="ghost" icon={CheckCheck} onClick={props.onSelectPage}>
          Select this page
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={props.onClear}>
          Clear selection
        </Button>
      </div>
    </section>
  )
}
