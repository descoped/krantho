import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import { fetchVersion, fetchVersions, restoreVersion } from '../../lib/api.js'
import type { VersionInfo } from '../../lib/api-types.js'
import type { RestoredVersion } from '../../lib/api-versions.js'
import { errorMessage } from '../../lib/fetch.js'
import { type Loaded, useLoaded } from '../../site/use-loaded.js'
import { Button } from '../../ui/button.js'
import { Modal } from '../../ui/modal.js'
import { useToast } from '../../ui/toast.js'
import type { Draft } from '../editor-model.js'
import { DataAlert, DataCard, DataNote } from './data-card.js'
import { formAsVersion, refreshFailed, restoreFailed, type VersionEntry } from './history-model.js'
import { RestoreModal, type RowActions, VersionActions, VersionRow } from './history-rows.js'
import { type Comparison, VersionDiff } from './version-diff.js'
import { VersionTimeline } from './version-timeline.js'
import './history-card.css'
import './version-timeline.css'

export interface HistoryCardProps {
  timeline?: boolean | undefined
  collection: string
  slug: string
  /** The locale version whose history is listed and restored */
  locale: string
  /** The saved versions: a new one (a save, a restore, a publish) reads the history again */
  saved: { version: number; liveVersion: number | null }
  draft: Draft
  /** The form holds unsaved changes, which a restore replaces */
  unsaved: boolean
  /** Offered when the API would accept it: an admin, and no one else holding the lock */
  canRestore: boolean
  /** A version was restored: the editor reads the document again */
  onRestored: () => Promise<void>
  onPrepare: (snapshot: Draft) => void
}

/** The history, read again — keeping the list on screen — whenever the saved version moves on */
function useHistory(props: HistoryCardProps): {
  loaded: Loaded<VersionEntry[]>
  reload: () => void
} {
  const { collection, slug, locale } = props
  const load = useCallback(
    () => fetchVersions(collection, slug, locale).then((r) => r.versions),
    [collection, slug, locale],
  )
  const { loaded, reload } = useLoaded(load, 'The history could not be read')
  const seen = useRef(props.saved.version)
  useEffect(() => {
    if (seen.current === props.saved.version) return
    seen.current = props.saved.version
    reload()
  }, [props.saved.version, reload])
  return { loaded, reload }
}

/** Diffs: open one, keep the element that opened it, and give focus back to it on close */
function useDiff(setError: (message: string | null) => void): {
  comparison: Comparison | null
  show: (load: () => Promise<Comparison>) => void
  close: () => void
} {
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  // Only the last diff asked for opens, whichever answer arrives last
  const latest = useRef(0)
  const show = (load: () => Promise<Comparison>): void => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError(null)
    const asked = ++latest.current
    load()
      .then((loaded) => {
        if (asked === latest.current) setComparison(loaded)
      })
      .catch((err: unknown) => {
        if (asked === latest.current) {
          setError(errorMessage(err, 'The versions to compare could not be read'))
        }
      })
  }
  const close = (): void => {
    setComparison(null)
    opener.current?.focus()
  }
  return { comparison, show, close }
}

/** Each version's actions: diff with the one before, compare with the form, restore */
function rowActions(
  props: HistoryCardProps,
  versions: readonly VersionEntry[],
  show: (load: () => Promise<Comparison>) => void,
  askRestore: (version: number) => void,
): (index: number) => RowActions {
  const load = (n: number): Promise<VersionInfo> =>
    fetchVersion(props.collection, props.slug, n, props.locale)
  return (index) => {
    const version = versions[index]
    if (!version) return { diff: null, compare: null, restore: null }
    const previous = versions[index + 1]
    const pair = async (older: number): Promise<Comparison> => {
      const [base, compare] = await Promise.all([load(older), load(version.version)])
      return { base, compare, form: false }
    }
    const withForm = async (): Promise<Comparison> => ({
      base: await load(version.version),
      compare: formAsVersion(versions, props.draft),
      form: true,
    })
    return {
      diff: previous ? () => show(() => pair(previous.version)) : null,
      compare: props.unsaved || index > 0 ? () => show(withForm) : null,
      restore: props.canRestore && index > 0 ? () => askRestore(version.version) : null,
    }
  }
}

/**
 * Restore after its confirmation, one at a time. A refused restore and a
 * restore whose page could not be read again are told apart; success is a toast.
 */
function useRestore(
  props: HistoryCardProps,
  setError: (message: string | null) => void,
): {
  asked: number | null
  restoring: boolean
  ask: (version: number) => void
  cancel: () => void
  confirm: () => void
} {
  const [asked, setAsked] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const toast = useToast()
  const run = async (version: number): Promise<void> => {
    setError(null)
    let restored: RestoredVersion
    try {
      restored = await restoreVersion(props.collection, props.slug, version, props.locale)
    } catch (err: unknown) {
      setError(restoreFailed(version, errorMessage(err, 'the store refused it')))
      return
    }
    try {
      await props.onRestored()
    } catch {
      setError(refreshFailed(version, restored.version))
      return
    }
    toast({
      text: `v${version} restored as v${restored.version}. The live page is unchanged until you publish.`,
    })
  }
  const confirm = (): void => {
    if (asked === null || restoring) return
    setAsked(null)
    setRestoring(true)
    void run(asked).finally(() => setRestoring(false))
  }
  return { asked, restoring, ask: setAsked, cancel: () => setAsked(null), confirm }
}

function VersionList(props: HistoryCardProps & { versions: VersionEntry[] }): ReactElement {
  const [error, setError] = useState<string | null>(null)
  const diff = useDiff(setError)
  const [prepare, setPrepare] = useState<number | null>(null)
  async function prepareDraft(version: number): Promise<void> {
    try {
      const snapshot = await fetchVersion(props.collection, props.slug, version, props.locale)
      props.onPrepare({
        fields: snapshot.fields,
        metadata: snapshot.metadata,
        body: snapshot.body,
        defaults: snapshot.defaults,
      })
      setPrepare(null)
    } catch (error) {
      setError(errorMessage(error, 'The snapshot could not be read'))
    }
  }
  const restore = useRestore(props, setError)
  const actionsAt = rowActions(props, props.versions, diff.show, restore.ask)
  return (
    <>
      {error && <DataAlert>{error}</DataAlert>}
      {props.canRestore && props.versions.length > 1 && (
        <details className="data-disclosure">
          <summary>Prepare an earlier snapshot as a draft</summary>
          <p>
            Bring its values into the current content form for review and correction. Nothing is
            saved or published.
          </p>
          {props.versions.slice(1).map((entry) => (
            <Button key={entry.version} size="sm" onClick={() => setPrepare(entry.version)}>
              Prepare v{entry.version}
            </Button>
          ))}
        </details>
      )}
      {prepare !== null && (
        <Modal
          title={`Prepare v${prepare} as a draft?`}
          onClose={() => setPrepare(null)}
          actions={
            <>
              <Button onClick={() => setPrepare(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  void prepareDraft(prepare)
                }}
              >
                Prepare draft
              </Button>
            </>
          }
        >
          <p>
            Replace the current form with this snapshot’s values. Review them against today’s
            content form before saving.
            {props.unsaved ? ' Your unsaved form changes will be replaced.' : ''}
          </p>
        </Modal>
      )}
      {props.timeline ? (
        <VersionTimeline
          {...props}
          actions={(index) => (
            <VersionActions
              n={props.versions[index]?.version ?? 0}
              actions={actionsAt(index)}
              restoring={restore.restoring}
            />
          )}
        />
      ) : (
        <ol className="data-versions" aria-label="Versions">
          {props.versions.map((version, index) => (
            <VersionRow
              key={version.version}
              version={version}
              props={props}
              actions={actionsAt(index)}
              restoring={restore.restoring}
            />
          ))}
        </ol>
      )}
      {diff.comparison && <VersionDiff comparison={diff.comparison} onClose={diff.close} />}
      {restore.asked !== null && (
        <RestoreModal
          version={restore.asked}
          unsaved={props.unsaved}
          onConfirm={restore.confirm}
          onClose={restore.cancel}
        />
      )}
    </>
  )
}

/** History of the locale version being edited: each version, Diff, Compare and Restore */
export function HistoryCard(props: HistoryCardProps): ReactElement {
  const { loaded: history, reload } = useHistory(props)
  const content = (
    <>
      {history.state === 'loading' && <DataNote>Reading the history…</DataNote>}
      {history.state === 'error' && (
        <div>
          <DataNote tone="error">{history.message}</DataNote>
          <Button size="sm" onClick={reload}>
            Retry history
          </Button>
        </div>
      )}
      {history.state === 'ready' &&
        (history.data.length === 0 ? (
          <DataNote>No version history yet.</DataNote>
        ) : (
          <VersionList {...props} versions={history.data} />
        ))}
    </>
  )
  if (props.timeline)
    return (
      <section className="snapshot-timeline" aria-label="Article snapshots">
        {content}
      </section>
    )
  return (
    <DataCard
      title="History"
      lead={`The ${props.locale.toUpperCase()} version's saved versions, newest first. Restore saves an earlier one again as a new version.`}
    >
      {content}
    </DataCard>
  )
}
