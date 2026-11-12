import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, type ReactElement, useId, useRef, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import {
  createMediaFolder,
  deleteMediaFolder,
  type MediaFolder,
  renameMediaFolder,
} from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { useToast } from '../ui/toast.js'
import { ADMIN_REASON, READ_ONLY_REASON } from './media-model.js'

interface FolderNameFormProps {
  label: string
  initial: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}

/** A folder name typed in place: Enter or the submit button saves, Esc or Cancel leaves */
function FolderNameForm(props: FolderNameFormProps): ReactElement {
  const { label, submitLabel, onCancel } = props
  const id = useId()
  const [name, setName] = useState(props.initial)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    await props.onSubmit(name.trim())
    setBusy(false)
  }
  return (
    <form className="media-folder-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={id} className="media-label">
        {label}
      </label>
      <input
        id={id}
        className="media-input"
        value={name}
        // biome-ignore lint/a11y/noAutofocus: the form opens on request, to type the name
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
      />
      <div className="media-actions">
        <Button size="sm" variant="primary" type="submit" aria-disabled={busy}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

interface DeleteFolderModalProps {
  folder: MediaFolder
  onClose: () => void
  onDeleted: () => void
}

/** Delete an empty folder, once confirmed; the API refuses one that holds files */
function DeleteFolderModal({ folder, onClose, onDeleted }: DeleteFolderModalProps): ReactElement {
  const toast = useToast()
  const safe = useRef<HTMLButtonElement>(null)
  async function run(): Promise<void> {
    try {
      await deleteMediaFolder(folder.id)
      toast({ text: `Folder ${folder.name} deleted.` })
      onDeleted()
    } catch (err: unknown) {
      toast({ text: errorMessage(err, 'The folder could not be deleted'), tone: 'error' })
    }
    onClose()
  }
  return (
    <Modal
      title="Delete folder"
      onClose={onClose}
      initialFocus={safe}
      actions={
        <>
          <Button ref={safe} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void run()}>
            Delete folder
          </Button>
        </>
      }
    >
      <p>
        Delete the folder <strong>{folder.name}</strong>? Only an empty folder can be deleted; its
        files stay in the library.
      </p>
    </Modal>
  )
}

type Editing = 'none' | 'new' | 'rename' | 'delete'

export interface FolderActionsProps {
  /** The selected folder: a new folder goes inside it; Rename and Delete act on it */
  selected: MediaFolder | null
  canEdit: boolean
  canAdminister: boolean
  /** A folder was created (its id) or changed */
  onChanged: (created?: string | undefined) => void
}

/** Create and rename, each saying when the API refuses; `onDone` follows a write that worked */
function useFolderWrites(onDone: (created?: string | undefined) => void): {
  create: (parent: MediaFolder | null, name: string) => Promise<void>
  rename: (folder: MediaFolder, name: string) => Promise<void>
} {
  const toast = useToast()
  async function write(action: () => Promise<string | undefined>, failed: string): Promise<void> {
    try {
      onDone(await action())
    } catch (err: unknown) {
      toast({ text: errorMessage(err, failed), tone: 'error' })
    }
  }
  return {
    create: (parent, name) =>
      write(
        async () => (await createMediaFolder(name, parent?.id ?? null)).id,
        'The folder could not be created',
      ),
    rename: (folder, name) =>
      write(async () => {
        await renameMediaFolder(folder.id, name)
        return undefined
      }, 'The folder could not be renamed'),
  }
}

/** The buttons: New folder, then Rename and Delete when a folder is selected */
function ActionRow({
  props,
  onEdit,
}: {
  props: FolderActionsProps
  onEdit: (editing: Editing) => void
}): ReactElement {
  const editReason = props.canEdit ? null : READ_ONLY_REASON
  return (
    <div className="media-folder-actions">
      <ActionButton size="sm" icon={FolderPlus} reason={editReason} onClick={() => onEdit('new')}>
        New folder
      </ActionButton>
      {props.selected && (
        <>
          <ActionButton
            size="sm"
            variant="ghost"
            icon={Pencil}
            reason={editReason}
            onClick={() => onEdit('rename')}
          >
            Rename folder
          </ActionButton>
          <ActionButton
            size="sm"
            variant="ghost"
            icon={Trash2}
            reason={props.canAdminister ? null : ADMIN_REASON}
            onClick={() => onEdit('delete')}
          >
            Delete folder
          </ActionButton>
        </>
      )}
    </div>
  )
}

/** New folder, and Rename and Delete for the selected one */
export function FolderActions(props: FolderActionsProps): ReactElement {
  const { selected, onChanged } = props
  const [editing, setEditing] = useState<Editing>('none')
  const close = (): void => setEditing('none')
  const writes = useFolderWrites((created) => {
    close()
    onChanged(created)
  })
  if (editing === 'new') {
    return (
      <FolderNameForm
        label={selected ? `New folder in ${selected.name}` : 'New folder'}
        initial=""
        submitLabel="Create"
        onSubmit={(name) => writes.create(selected, name)}
        onCancel={close}
      />
    )
  }
  if (editing === 'rename' && selected) {
    return (
      <FolderNameForm
        label="Folder name"
        initial={selected.name}
        submitLabel="Rename"
        onSubmit={(name) => writes.rename(selected, name)}
        onCancel={close}
      />
    )
  }
  return (
    <>
      <ActionRow props={props} onEdit={setEditing} />
      {editing === 'delete' && selected && (
        <DeleteFolderModal folder={selected} onClose={close} onDeleted={() => onChanged()} />
      )}
    </>
  )
}
