import { Save } from 'lucide-react'
import { type FormEvent, type ReactElement, useId, useRef, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import type { MediaFolder, MediaItem } from '../lib/api.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { READ_ONLY_REASON, type References, renameWarning } from './media-model.js'
import { MediaTags } from './media-tags.js'
import { type Details, useMove, useSaveDetails } from './use-drawer-actions.js'
import { useRenameGate } from './use-rename-gate.js'

/** Confirm a rename of a file documents use, saying what a rename changes */
function RenameModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number | null
  onConfirm: () => void
  onCancel: () => void
}): ReactElement {
  const safe = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      title="Rename a file in use"
      onClose={onCancel}
      initialFocus={safe}
      actions={
        <>
          <Button ref={safe} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Rename
          </Button>
        </>
      }
    >
      <p>{renameWarning(count)}</p>
    </Modal>
  )
}

function TextField({
  label,
  value,
  disabled,
  note,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  note?: string | undefined
  onChange: (value: string) => void
}): ReactElement {
  const id = useId()
  return (
    <div className="media-field">
      <label htmlFor={id} className="media-label">
        {label}
      </label>
      <input
        id={id}
        className="media-input"
        value={value}
        disabled={disabled}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {note && (
        <p id={`${id}-note`} className="media-note">
          {note}
        </p>
      )}
    </div>
  )
}

/** The folder the file is in; moving saves at once */
function FolderField({
  item,
  folders,
  disabled,
  onMoved,
}: {
  item: MediaItem
  folders: readonly MediaFolder[]
  disabled: boolean
  onMoved: (item: MediaItem) => void
}): ReactElement {
  const id = useId()
  const move = useMove(item, onMoved)
  return (
    <div className="media-field">
      <label htmlFor={id} className="media-label">
        Folder
      </label>
      <select
        id={id}
        className="media-select"
        value={item.folder ?? ''}
        disabled={disabled || move.busy}
        onChange={(event) => void move.run(event.target.value || null)}
      >
        <option value="">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export interface DrawerDetailsProps {
  item: MediaItem
  references: References | undefined
  folders: readonly MediaFolder[] | null
  knownTags: readonly string[]
  canEdit: boolean
  onSaved: (item: MediaItem) => void
}

/** Save submits the form; read-only, it stays focusable and says why */
function SaveButton({
  canEdit,
  busy,
  checking,
}: {
  canEdit: boolean
  busy: boolean
  /** A rename waits for the file's references before it is saved */
  checking: boolean
}): ReactElement {
  if (!canEdit) {
    return (
      <ActionButton size="sm" icon={Save} reason={READ_ONLY_REASON} onClick={() => undefined}>
        Save
      </ActionButton>
    )
  }
  return (
    <Button type="submit" variant="primary" size="sm" icon={Save} aria-disabled={busy || checking}>
      {checking ? 'Checking references…' : busy ? 'Saving…' : 'Save'}
    </Button>
  )
}

const NO_ALT_NOTE =
  'No alt text: screen readers and search engines get no description of the image.'

interface DetailFieldsProps {
  props: DrawerDetailsProps
  details: Details
  change: (patch: Partial<Details>) => void
}

/** The fields of the form, each saved with Save but the folder, which moves at once */
function DetailFields({ props, details, change }: DetailFieldsProps): ReactElement {
  const readOnly = !props.canEdit
  return (
    <>
      <TextField
        label="Name"
        value={details.filename}
        disabled={readOnly}
        onChange={(filename) => change({ filename })}
      />
      <TextField
        label="Alt text"
        value={details.altText}
        disabled={readOnly}
        note={details.altText.trim() ? undefined : NO_ALT_NOTE}
        onChange={(altText) => change({ altText })}
      />
      <MediaTags
        tags={details.tags}
        known={props.knownTags}
        disabled={readOnly}
        onChange={(tags) => change({ tags })}
      />
      {props.folders && props.folders.length > 0 && (
        <FolderField
          item={props.item}
          folders={props.folders}
          disabled={readOnly}
          onMoved={props.onSaved}
        />
      )}
    </>
  )
}

/** Name, alt text, tags and folder — saved on the media file, for every page that uses it */
export function DrawerDetails(props: DrawerDetailsProps): ReactElement {
  const { item } = props
  const [details, setDetails] = useState<Details>({
    filename: item.filename,
    altText: item.altText,
    tags: [...item.tags],
  })
  const save = useSaveDetails(item, props.onSaved)
  const gate = useRenameGate(props.references, () => void save.run(details))
  const change = (patch: Partial<Details>): void => setDetails((d) => ({ ...d, ...patch }))
  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!props.canEdit || save.busy || gate.state.phase !== 'idle') return
    if (details.filename === item.filename) void save.run(details)
    else gate.request()
  }
  return (
    <form className="media-details" aria-label="Details" onSubmit={submit}>
      <DetailFields props={props} details={details} change={change} />
      <SaveButton
        canEdit={props.canEdit}
        busy={save.busy}
        checking={gate.state.phase === 'checking'}
      />
      {gate.state.phase === 'confirm' && (
        <RenameModal count={gate.state.count} onCancel={gate.cancel} onConfirm={gate.confirm} />
      )}
    </form>
  )
}
