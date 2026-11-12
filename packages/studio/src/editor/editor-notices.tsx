import { History, Languages, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import { formatShortDateTime } from '../lib/format.js'
import { Button } from '../ui/button.js'
import { type Keeping, keptBasis, type StoredDraft } from './kept-work.js'
import type { SaveFailure } from './save-failure.js'
import type { Workspace } from './use-workspace.js'

/** When and on what the kept work was made: "from 2026-10-02 14:05, made on v5 — the document is now v6" */
function keptWhen(offer: StoredDraft, currentVersion: number | null): string {
  const when = offer.savedAt ? ` from ${formatShortDateTime(offer.savedAt)}` : ''
  const basis = keptBasis(offer, currentVersion)
  return `${when}${basis ? `, ${basis}` : ''}`
}

/** Kept work from an earlier visit: Restore puts it in the form, Discard throws it away */
function RecoveryNotice({
  offer,
  currentVersion,
  onRestore,
  onDiscard,
}: {
  offer: StoredDraft
  currentVersion: number | null
  onRestore: () => void
  onDiscard: () => void
}): ReactElement {
  return (
    <section className="editor-notice" aria-label="Unsaved changes kept in this browser">
      <History className="editor-notice-icon" aria-hidden="true" />
      <p className="editor-notice-text">
        Unsaved changes{keptWhen(offer, currentVersion)} are kept in this browser.
      </p>
      <span className="editor-notice-actions">
        <Button size="sm" variant="primary" onClick={onRestore}>
          Restore
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </span>
    </section>
  )
}

/** What a conflict leaves of the work besides the form: kept in this browser, or not, and why */
export function conflictKeeping(keeping: Keeping, newer: number): string {
  if (keeping === 'kept') return ` They are also kept in this browser; reload to see v${newer}.`
  if (keeping === 'offer-pending') {
    return ' They are not kept in this browser while earlier changes wait to be restored or discarded: reloading loses them.'
  }
  return ' This browser cannot keep them: reloading loses them.'
}

/**
 * A refused save or publish. A version conflict names the newer version and
 * says truthfully whether the work is kept; replacing the newer version is a
 * separate, explicit choice, never the suggested way out.
 */
function FailureNotice({
  failure,
  keeping,
  onOverwrite,
}: {
  failure: SaveFailure
  keeping: Keeping
  onOverwrite: (version: number) => void
}): ReactElement {
  const newer = failure.conflictWith
  return (
    <div className="editor-notice editor-notice--error">
      <TriangleAlert className="editor-notice-icon" aria-hidden="true" />
      <p className="editor-notice-text">
        {failure.message}
        {newer !== undefined && conflictKeeping(keeping, newer)}
      </p>
      {newer !== undefined && (
        <Button size="sm" variant="danger" onClick={() => onOverwrite(newer)}>
          Overwrite v{newer} with my changes
        </Button>
      )}
    </div>
  )
}

function MissingLocaleNotice({
  slug,
  asked,
  editing,
}: {
  slug: string
  asked: string
  editing: string
}): ReactElement {
  return (
    <p className="editor-notice">
      <Languages className="editor-notice-icon" aria-hidden="true" />
      <span className="editor-notice-text">
        {slug} has no {asked.toUpperCase()} version yet. You are editing the {editing.toUpperCase()}{' '}
        version.
      </span>
    </p>
  )
}

export interface EditorNoticesProps {
  workspace: Workspace
  /** The locale the address asked for, when the document has no version of its own there */
  missingLocale: string | null
  /** Answering the kept work removes its notice: focus moves to the form */
  onAnswered: () => void
}

/** The always-present alert region a refused save or publish is announced in */
function FailureRegion({
  workspace,
  onAnswered,
}: Omit<EditorNoticesProps, 'missingLocale'>): ReactElement {
  const { actions } = workspace
  return (
    <div role="alert" className="editor-alert-region">
      {actions.failure && (
        <FailureNotice
          failure={actions.failure}
          keeping={workspace.autosave.keeping}
          onOverwrite={(version) => {
            onAnswered()
            void actions.save(version)
          }}
        />
      )}
    </div>
  )
}

/** What the editor must say above the form: a failed save, kept work, a missing locale version */
export function EditorNotices({
  workspace,
  missingLocale,
  onAnswered,
}: EditorNoticesProps): ReactElement {
  const { autosave, document } = workspace
  const answer = (choice: () => void) => () => {
    choice()
    onAnswered()
  }
  return (
    <div className="editor-notices">
      <FailureRegion workspace={workspace} onAnswered={onAnswered} />
      {autosave.offer && (
        <RecoveryNotice
          offer={autosave.offer}
          currentVersion={document?.meta.version ?? null}
          onRestore={answer(workspace.restoreKept)}
          onDiscard={answer(autosave.discard)}
        />
      )}
      {missingLocale && document && (
        <MissingLocaleNotice
          slug={document.meta.slug}
          asked={missingLocale}
          editing={document.meta.locale}
        />
      )}
    </div>
  )
}
