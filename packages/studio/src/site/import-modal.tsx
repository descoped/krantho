import {
  type ChangeEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { importCollection } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { parseImport } from './transfer.js'

type ImportResults = Awaited<ReturnType<typeof importCollection>>['results']

type Phase =
  | { name: 'edit'; error: string | null }
  | { name: 'importing' }
  | { name: 'done'; imported: number; total: number; results: ImportResults }

export interface ImportModalProps {
  collection: string
  onClose: () => void
  /** Called once the import has run */
  onImported: () => void
}

const PLACEHOLDER = `{
  "items": [
    { "identity": { "collection": "pages", "slug": "my-page", "locale": "en" }, "contract": null, "fields": { "title": "My page" }, "metadata": {}, "defaults": [], "body": "## Section" }
  ]
}`

function Results({ phase }: { phase: Extract<Phase, { name: 'done' }> }): ReactElement {
  const failed = phase.results.filter((result) => !result.imported)
  return (
    <div role="status">
      <p>
        Imported {phase.imported} of {phase.total}. Each is saved as a new version; visitors see it
        once it is published.
      </p>
      {failed.length > 0 && (
        <ul className="site-outcome-failures">
          {failed.map((result) => (
            <li key={result.slug}>
              <code>{result.slug}</code>: {result.error ?? 'Not imported'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SourceFields({
  text,
  error,
  onText,
}: {
  text: string
  error: string | null
  onText: (text: string) => void
}): ReactElement {
  const textId = useId()
  const errorId = useId()
  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file) onText(await file.text())
  }
  return (
    <div className="site-import">
      <p>
        Paste a collection export or choose its JSON file. Reviewed changes become draft snapshots,
        including document details. Conflicting changes need review before importing.
      </p>
      <label className="site-import-file">
        <span>Choose file</span>
        <input type="file" accept="application/json,.json" onChange={(e) => void choose(e)} />
      </label>
      <label htmlFor={textId} className="site-import-label">
        JSON
      </label>
      <textarea
        id={textId}
        className="site-import-text"
        rows={10}
        spellCheck={false}
        value={text}
        placeholder={PLACEHOLDER}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onText(event.target.value)}
      />
      {error && (
        <p id={errorId} className="site-import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** The import's phase, and the action that runs it on the text */
function useImport(
  collection: string,
  onImported: () => void,
): { phase: Phase; setPhase: (phase: Phase) => void; run: (text: string) => Promise<void> } {
  const [phase, setPhase] = useState<Phase>({ name: 'edit', error: null })
  async function run(text: string): Promise<void> {
    const parsed = parseImport(text)
    if (!parsed.ok) {
      setPhase({ name: 'edit', error: parsed.error })
      return
    }
    setPhase({ name: 'importing' })
    try {
      const result = await importCollection(collection, parsed.items)
      setPhase({ name: 'done', ...result })
      onImported()
    } catch (err: unknown) {
      setPhase({ name: 'edit', error: errorMessage(err, 'Import failed') })
    }
  }
  return { phase, setPhase, run }
}

function Actions({
  phase,
  ready,
  closeRef,
  onClose,
  onRun,
}: {
  phase: Phase
  ready: boolean
  closeRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRun: () => void
}): ReactElement {
  if (phase.name === 'done') {
    return (
      <Button ref={closeRef} onClick={onClose}>
        Close
      </Button>
    )
  }
  const busy = phase.name === 'importing'
  return (
    <>
      <Button onClick={busy ? undefined : onClose} aria-disabled={busy}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={busy || !ready ? undefined : onRun}
        aria-disabled={busy || !ready}
      >
        {busy ? 'Importing…' : 'Import'}
      </Button>
    </>
  )
}

/** Import documents into a collection from pasted or chosen JSON, then show what was imported */
export function ImportModal({ collection, onClose, onImported }: ImportModalProps): ReactElement {
  const [text, setText] = useState('')
  const { phase, setPhase, run } = useImport(collection, onImported)
  const closeRef = useRef<HTMLButtonElement>(null)
  const busy = phase.name === 'importing'

  useEffect(() => {
    if (phase.name === 'done') closeRef.current?.focus()
  }, [phase.name])

  return (
    <Modal
      title="Import documents"
      onClose={busy ? () => undefined : onClose}
      busy={busy}
      actions={
        <Actions
          phase={phase}
          ready={text.trim() !== ''}
          closeRef={closeRef}
          onClose={onClose}
          onRun={() => void run(text)}
        />
      }
    >
      {phase.name === 'done' ? (
        <Results phase={phase} />
      ) : (
        <SourceFields
          text={text}
          error={phase.name === 'edit' ? phase.error : null}
          onText={(next) => {
            setText(next)
            setPhase({ name: 'edit', error: null })
          }}
        />
      )}
    </Modal>
  )
}
