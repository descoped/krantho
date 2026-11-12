import { ExternalLink, Lock } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from 'react'
import { type DocumentStatus, STATUS_LABELS } from '../lib/document-status.js'
import { formatShortDateTime } from '../lib/format.js'
import { lockHolderName } from '../lib/locks.js'
import { buttonClass } from '../ui/button.js'
import type { ChipTone } from '../ui/chip.js'
import { ActionButton } from './action-button.js'
import {
  type HeaderFacts,
  headerStatus,
  publishBlocker,
  type SiteLink,
  type StatusChange,
  saveBlocker,
  statusBlocker,
  versionDetail,
} from './header-model.js'
import { HeaderPopover } from './header-popover.js'
import type { EditorMode, EditorModeId } from './modes.js'
import type { EditLock } from './use-edit-lock.js'

const STATUS_TONES: Readonly<Record<DocumentStatus, ChipTone>> = {
  live: 'success',
  ahead: 'warning',
  draft: 'neutral',
}

/** The saved version's record: its status and when and by whom it was saved */
export interface SavedRecord {
  status: string
  createdAt: string
  changedBy: string | null
}

export interface EditorHeaderProps {
  modes: readonly EditorMode[]
  mode: EditorModeId
  onMode: (mode: EditorModeId) => void
  /** Ids that tie each mode's tab to the canvas */
  tabId: (mode: EditorModeId) => string
  panelId: string
  facts: HeaderFacts
  /** Save draft is under way */
  saving: boolean
  record: SavedRecord | null
  lock: EditLock
  /** The locale chips, when the site has several locales */
  locales: ReactNode
  siteLink: SiteLink | null
  onSave: () => void
  onPublish: () => void
  /** Change the status without publishing: off the site, or back to draft; offered when it can be */
  onStatusChange: ((change: StatusChange) => void) | null
}

/** The modes as tabs: arrow keys move between them, the canvas is their panel */
function ModeSwitcher(props: EditorHeaderProps): ReactElement {
  const { modes, mode, onMode, tabId, panelId } = props
  const listRef = useRef<HTMLDivElement>(null)
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const index = modes.findIndex((m) => m.id === mode)
    const next = modes[(index + step + modes.length) % modes.length]
    if (!next) return
    onMode(next.id)
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(next.id))}`)?.focus()
  }
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Mode"
      className="editor-modes"
      onKeyDown={onKeyDown}
    >
      {modes.map((entry) => (
        <button
          key={entry.id}
          id={tabId(entry.id)}
          type="button"
          role="tab"
          className="editor-mode"
          aria-selected={entry.id === mode}
          aria-controls={panelId}
          tabIndex={entry.id === mode ? 0 : -1}
          onClick={() => onMode(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}

function lockLine(lock: EditLock): string {
  if (lock.state === 'held') return 'You hold the edit lock'
  if (lock.state === 'foreign') return `${lock.holder} is editing`
  if (lock.state === 'unavailable') return 'Not locked: this store keeps no edit locks'
  return 'Not locked'
}

/** Unpublish and Archive take the page off the site; an archived page goes back to draft. Each is confirmed */
function StatusActions({
  props,
  dismiss,
}: {
  props: EditorHeaderProps
  dismiss: () => void
}): ReactElement | null {
  const { facts, record, onStatusChange } = props
  if (!onStatusChange) return null
  const live = facts.saved !== null && facts.saved.liveVersion !== null
  const archived = record?.status === 'archived'
  const reason = statusBlocker(facts)
  // The chip takes focus first, so it is where focus returns when the confirmation closes
  const change = (next: StatusChange) => (): void => {
    dismiss()
    onStatusChange(next)
  }
  return (
    <div className="editor-detail-actions">
      {live && (
        <ActionButton size="sm" reason={reason} onClick={change('unpublish')}>
          Unpublish
        </ActionButton>
      )}
      <ActionButton size="sm" reason={reason} onClick={change(archived ? 'unarchive' : 'archive')}>
        {archived ? 'Restore to draft' : 'Archive'}
      </ActionButton>
      {reason && <p className="editor-detail-text">{reason}</p>}
    </div>
  )
}

/** The status chip's detail: the versions, the edit lock and the last save */
function StatusDetail({
  props,
  dismiss,
}: {
  props: EditorHeaderProps
  dismiss: () => void
}): ReactElement {
  const { facts, record, lock } = props
  return (
    <>
      <dl className="editor-detail">
        <dt>Versions</dt>
        <dd>{versionDetail(facts.saved)}</dd>
        <dt>Edit lock</dt>
        <dd>{lockLine(lock)}</dd>
        {record && (
          <>
            <dt>Last save</dt>
            <dd>
              {formatShortDateTime(record.createdAt)}
              {record.changedBy && ` by ${lockHolderName(record.changedBy)}`}
              {record.status === 'archived' && ' · archived'}
            </dd>
          </>
        )}
      </dl>
      <StatusActions props={props} dismiss={dismiss} />
    </>
  )
}

function LockChip({ lock }: { lock: EditLock }): ReactElement | null {
  if (lock.state !== 'foreign') return null
  return (
    <HeaderPopover label={`${lock.holder} is editing`} tone="warning" icon={Lock}>
      <p className="editor-detail-text">
        {lock.expiresAt && `Their lock runs until ${formatShortDateTime(lock.expiresAt)}. `}
        The editor is read-only until they finish or the lock expires; it opens for you then.
      </p>
    </HeaderPopover>
  )
}

function SiteButton({ link }: { link: SiteLink }): ReactElement {
  const what = link.kind === 'preview' ? 'the saved draft' : 'the live page'
  return (
    <a
      className={buttonClass('ghost', 'md', 'editor-site-link')}
      href={link.href}
      target="_blank"
      rel="noreferrer"
      title={`Opens ${what} in a new tab`}
    >
      <ExternalLink className="ui-button-icon" aria-hidden="true" />
      Open on site
      <span className="visually-hidden"> ({what}, opens in a new tab)</span>
    </a>
  )
}

/** The editor's one header row: modes, the status, the lock, the locales and the actions */
export function EditorHeader(props: EditorHeaderProps): ReactElement {
  const { facts, siteLink, onSave, onPublish } = props
  const status = headerStatus(facts.saved)
  const saveReason = saveBlocker(facts)
  const publishReason = publishBlocker(facts)
  return (
    <div className="editor-header">
      <ModeSwitcher {...props} />
      <span className="editor-header-spacer" />
      <HeaderPopover label={STATUS_LABELS[status]} tone={STATUS_TONES[status]}>
        {(dismiss) => <StatusDetail props={props} dismiss={dismiss} />}
      </HeaderPopover>
      <LockChip lock={props.lock} />
      {props.locales}
      {siteLink && <SiteButton link={siteLink} />}
      {facts.canEdit && (
        <>
          <ActionButton reason={saveReason} onClick={onSave}>
            {props.saving ? 'Saving…' : 'Save draft'}
          </ActionButton>
          <ActionButton reason={publishReason} variant="primary" onClick={onPublish}>
            Publish
          </ActionButton>
        </>
      )}
    </div>
  )
}
