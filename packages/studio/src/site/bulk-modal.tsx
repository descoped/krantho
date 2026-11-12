import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react'
import { bulkDeleteItems, bulkPublishItems } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'

export type BulkAction = 'publish' | 'delete'

/** What a bulk action did: how many it changed, and why the rest were left */
export interface BulkOutcome {
  done: number
  failures: Array<{ slug: string; error: string }>
}

type Phase =
  | { name: 'ask' }
  | { name: 'working' }
  | { name: 'done'; outcome: BulkOutcome }
  | { name: 'failed'; message: string }

export interface BulkModalProps {
  action: BulkAction
  collection: string
  slugs: readonly string[]
  /** The locale the documents are published or deleted in */
  locale: string
  onClose: () => void
  /** Called once the action has run, whatever it changed */
  onDone: () => void
}

function documents(count: number): string {
  return count === 1 ? '1 document' : `${count} documents`
}

/** One document's result, whatever the action */
interface BulkResult {
  slug: string
  changed: boolean
  error?: string | undefined
}

function outcomeOf(done: number, results: readonly BulkResult[]): BulkOutcome {
  const failures = results
    .filter((result) => !result.changed)
    .map((result) => ({ slug: result.slug, error: result.error ?? 'Not changed' }))
  return { done, failures }
}

/** Runs the action through the bulk API, in one locale; each document succeeds or fails on its own */
async function runBulk(
  action: BulkAction,
  collection: string,
  slugs: readonly string[],
  locale: string,
): Promise<BulkOutcome> {
  if (action === 'publish') {
    const { published, results } = await bulkPublishItems(collection, [...slugs], locale)
    return outcomeOf(
      published,
      results.map((r) => ({ slug: r.slug, changed: r.published, error: r.error })),
    )
  }
  const { deleted, results } = await bulkDeleteItems(collection, [...slugs], locale)
  return outcomeOf(
    deleted,
    results.map((r) => ({ slug: r.slug, changed: r.deleted, error: r.error })),
  )
}

interface Copy {
  title: string
  verb: string
  busy: string
  ask: string
}

const COPY: Readonly<Record<BulkAction, Copy>> = {
  publish: {
    title: 'Publish documents',
    verb: 'Publish',
    busy: 'Publishing…',
    ask: 'Publishing makes each saved version what visitors see.',
  },
  delete: {
    title: 'Delete documents',
    verb: 'Delete',
    busy: 'Deleting…',
    ask: 'Each document leaves the site and Studio in this locale. This cannot be undone.',
  },
}

function Outcome({ action, outcome }: { action: BulkAction; outcome: BulkOutcome }): ReactElement {
  const past = action === 'publish' ? 'Published' : 'Deleted'
  return (
    <div role="status">
      <p>
        {past} {documents(outcome.done)}.
      </p>
      {outcome.failures.length > 0 && (
        <ul className="site-outcome-failures">
          {outcome.failures.map((failure) => (
            <li key={failure.slug}>
              <code>{failure.slug}</code>: {failure.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Message({ props, phase }: { props: BulkModalProps; phase: Phase }): ReactElement {
  if (phase.name === 'done') return <Outcome action={props.action} outcome={phase.outcome} />
  if (phase.name === 'failed') return <p role="alert">{phase.message}</p>
  const copy = COPY[props.action]
  return (
    <p>
      {copy.verb} {documents(props.slugs.length)} in <code>{props.locale}</code>? {copy.ask}
    </p>
  )
}

function Actions({
  props,
  phase,
  safeRef,
  onRun,
}: {
  props: BulkModalProps
  phase: Phase
  safeRef: RefObject<HTMLButtonElement | null>
  onRun: () => void
}): ReactElement {
  if (phase.name === 'done' || phase.name === 'failed') {
    return (
      <Button ref={safeRef} onClick={props.onClose}>
        Close
      </Button>
    )
  }
  const busy = phase.name === 'working'
  const verb = COPY[props.action].verb
  return (
    <>
      <Button ref={safeRef} onClick={busy ? undefined : props.onClose} aria-disabled={busy}>
        Cancel
      </Button>
      <Button
        variant={props.action === 'delete' ? 'danger' : 'primary'}
        onClick={busy ? undefined : onRun}
        aria-disabled={busy}
      >
        {busy ? COPY[props.action].busy : `${verb} ${documents(props.slugs.length)}`}
      </Button>
    </>
  )
}

/** The confirmation of a bulk Publish or Delete, naming the count, then what it did */
export function BulkModal(props: BulkModalProps): ReactElement {
  const [phase, setPhase] = useState<Phase>({ name: 'ask' })
  const safeRef = useRef<HTMLButtonElement>(null)
  const busy = phase.name === 'working'

  // The answer replaces the buttons: keep focus on the one that is left
  useEffect(() => {
    if (phase.name === 'done' || phase.name === 'failed') safeRef.current?.focus()
  }, [phase.name])

  async function run(): Promise<void> {
    setPhase({ name: 'working' })
    try {
      const outcome = await runBulk(props.action, props.collection, props.slugs, props.locale)
      setPhase({ name: 'done', outcome })
    } catch (err: unknown) {
      setPhase({ name: 'failed', message: errorMessage(err, `${COPY[props.action].verb} failed`) })
    }
    props.onDone()
  }

  return (
    <Modal
      title={COPY[props.action].title}
      onClose={busy ? () => undefined : props.onClose}
      initialFocus={safeRef}
      busy={busy}
      actions={<Actions props={props} phase={phase} safeRef={safeRef} onRun={() => void run()} />}
    >
      <Message props={props} phase={phase} />
    </Modal>
  )
}
