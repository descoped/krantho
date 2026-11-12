import { type ReactElement, useRef } from 'react'
import { formatShortDateTime } from '../../lib/format.js'
import { lockHolderName } from '../../lib/locks.js'
import { Button } from '../../ui/button.js'
import { Chip } from '../../ui/chip.js'
import { Modal } from '../../ui/modal.js'
import type { HistoryCardProps } from './history-card.js'
import { restoreMessage, type VersionEntry, versionChips } from './history-model.js'

/** Confirms a restore, saying what it replaces; Cancel has focus first */
export function RestoreModal(props: {
  version: number
  unsaved: boolean
  onConfirm: () => void
  onClose: () => void
}): ReactElement {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      title={`Restore v${props.version}?`}
      onClose={props.onClose}
      initialFocus={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={props.onConfirm}>
            Restore
          </Button>
        </>
      }
    >
      <p>{restoreMessage(props.version, props.unsaved)}</p>
    </Modal>
  )
}

export interface RowActions {
  diff: (() => void) | null
  compare: (() => void) | null
  restore: (() => void) | null
}

/** Diff, Compare and Restore — each where it applies, named with its version; Restore waits while one runs */
export function VersionActions({
  n,
  actions,
  restoring,
}: {
  n: number
  actions: RowActions
  restoring: boolean
}): ReactElement {
  return (
    <span className="data-version-actions">
      {actions.diff && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Diff v${n} with the version before`}
          onClick={actions.diff}
        >
          Diff
        </Button>
      )}
      {actions.compare && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Compare v${n} with your form`}
          onClick={actions.compare}
        >
          Compare
        </Button>
      )}
      {actions.restore && (
        <Button
          size="sm"
          aria-label={`Restore v${n}`}
          aria-disabled={restoring}
          title={restoring ? 'A restore is under way.' : undefined}
          onClick={restoring ? undefined : actions.restore}
        >
          Restore
        </Button>
      )}
    </span>
  )
}

export function VersionRow({
  version,
  props,
  actions,
  restoring,
}: {
  version: VersionEntry
  props: HistoryCardProps
  actions: RowActions
  restoring: boolean
}): ReactElement {
  const chips = versionChips(version.version, props.saved)
  return (
    <li className="data-version">
      <span className="data-version-number">v{version.version}</span>
      <span className="data-version-meta">
        <time dateTime={version.createdAt}>{formatShortDateTime(version.createdAt)}</time>
        <span>{version.changedBy ? lockHolderName(version.changedBy) : 'Unknown author'}</span>
      </span>
      <span className="data-version-chips">
        {chips.live && <Chip tone="success">live</Chip>}
        {chips.current && <Chip tone="accent">current</Chip>}
      </span>
      <VersionActions n={version.version} actions={actions} restoring={restoring} />
    </li>
  )
}
