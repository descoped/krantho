import { Archive, History, Trash2 } from 'lucide-react'
import { type ReactElement, useRef, useState } from 'react'
import { type CheckpointInfo, createCheckpoint, fetchCheckpoints } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { errorMessage } from '../lib/fetch.js'
import { formatShortDateTime } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { EmptyState } from '../ui/empty-state.js'
import { useToast } from '../ui/toast.js'
import { DeleteCheckpoint, RestoreCheckpoint } from './checkpoint-confirms.js'
import { checkpointName, TRIGGER_LABELS } from './checkpoints-model.js'
import { TextInput } from './setup-inputs.js'
import { LoadError, Loading, SetupNote, SetupSection, ValuesFrom } from './setup-section.js'

type Dialog = { kind: 'restore' | 'delete'; checkpoint: CheckpointInfo } | null

function columns(admin: boolean, onDialog: (dialog: Dialog) => void): DataColumn<CheckpointInfo>[] {
  const actions = (checkpoint: CheckpointInfo): ReactElement | null =>
    admin ? (
      <span className="setup-row-actions">
        <Button
          size="sm"
          icon={History}
          aria-label={`Restore ${checkpointName(checkpoint)}`}
          onClick={() => onDialog({ kind: 'restore', checkpoint })}
        >
          Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={`Delete ${checkpointName(checkpoint)}`}
          onClick={() => onDialog({ kind: 'delete', checkpoint })}
        >
          Delete
        </Button>
      </span>
    ) : null
  return [
    { id: 'name', header: 'Checkpoint', primary: true, cell: (c) => checkpointName(c) },
    { id: 'trigger', header: 'Taken', cell: (c) => <Chip>{TRIGGER_LABELS[c.trigger]}</Chip> },
    { id: 'created', header: 'Created', cell: (c) => formatShortDateTime(c.createdAt) },
    { id: 'actions', header: 'Actions', cell: actions },
  ]
}

/** Name and Create: a manual checkpoint of the content store as it is now */
function CreateCheckpoint({ onCreated }: { onCreated: () => void }): ReactElement {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const creating = useRef(false)
  async function create(): Promise<void> {
    if (creating.current) return
    creating.current = true
    setBusy(true)
    try {
      const created = await createCheckpoint(name.trim() || undefined)
      toast({ text: `Created ${checkpointName(created)}.` })
      setName('')
      onCreated()
    } catch (err: unknown) {
      toast({ text: errorMessage(err, 'The checkpoint could not be created'), tone: 'error' })
    } finally {
      creating.current = false
      setBusy(false)
    }
  }
  return (
    <form
      className="setup-inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) void create()
      }}
    >
      <TextInput
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Before the spring relaunch"
        hint="Optional"
      />
      <Button type="submit" variant="primary" icon={Archive} aria-disabled={busy}>
        {busy ? 'Creating…' : 'Create checkpoint'}
      </Button>
    </form>
  )
}

function CheckpointSources(): ReactElement {
  return (
    <ValuesFrom source="database">
      Stored in the site's database. A checkpoint marks a point in time and copies nothing;
      restoring one rewinds to it. The API lists each checkpoint's number, name, what took it and
      when — not its size or the schema version it was taken under.
    </ValuesFrom>
  )
}

/** Setup › Checkpoints: create one, and restore or delete one, each confirmed */
export function CheckpointsTab(): ReactElement {
  const { hasRole } = useAuth()
  const { loaded, reload } = useLoaded(fetchCheckpoints, 'The checkpoints could not be read')
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = (): void => setDialog(null)
  const after = (): void => {
    close()
    reload()
  }
  return (
    <SetupSection title="Checkpoints" sources={<CheckpointSources />}>
      {hasRole('editor') ? (
        <CreateCheckpoint onCreated={reload} />
      ) : (
        <SetupNote>Editors and admins create checkpoints.</SetupNote>
      )}
      {loaded.state === 'loading' && <Loading what="the checkpoints" />}
      {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
      {loaded.state === 'ready' && loaded.data.length === 0 && (
        <EmptyState icon={Archive} title="No checkpoints yet">
          Create one to mark the content store as it is now, so you can return to it.
        </EmptyState>
      )}
      {loaded.state === 'ready' && loaded.data.length > 0 && (
        <DataTable
          caption="Checkpoints, newest first"
          columns={columns(hasRole('admin'), setDialog)}
          rows={loaded.data}
          rowKey={(c) => String(c.version)}
        />
      )}
      {dialog?.kind === 'restore' && (
        <RestoreCheckpoint checkpoint={dialog.checkpoint} onDone={after} onClose={close} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteCheckpoint checkpoint={dialog.checkpoint} onDone={after} onClose={close} />
      )}
    </SetupSection>
  )
}
