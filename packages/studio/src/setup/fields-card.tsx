import { FileCode, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { type ReactElement, useCallback, useState } from 'react'
import {
  type CollectionInfo,
  deleteRuntimeField,
  fetchRuntimeSchema,
  fetchSchema,
  type RuntimeFieldDefinition,
  saveRuntimeField,
} from '../lib/api.js'
import { collectionLabel } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { useToast } from '../ui/toast.js'
import { type SchemaField, schemaFields } from './collections-model.js'
import { ConfirmModal } from './confirm-modal.js'
import { FieldDialog } from './field-dialog.js'
import { fieldTypeName } from './field-form.js'
import { LoadError, Loading, SetupSection, ValuesFrom } from './setup-section.js'
import { ZodExportModal } from './zod-export-modal.js'

type Dialog =
  | { kind: 'edit'; field: RuntimeFieldDefinition | null }
  | { kind: 'delete'; field: RuntimeFieldDefinition }
  | { kind: 'export' }
  | null

function RuntimeActions({
  field,
  onDialog,
}: {
  field: RuntimeFieldDefinition
  onDialog: (dialog: Dialog) => void
}): ReactElement {
  return (
    <span className="setup-row-actions">
      <Button
        size="sm"
        icon={Pencil}
        aria-label={`Edit ${field.name}`}
        onClick={() => onDialog({ kind: 'edit', field })}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={Trash2}
        aria-label={`Delete ${field.name}`}
        onClick={() => onDialog({ kind: 'delete', field })}
      >
        Delete
      </Button>
    </span>
  )
}

/** A code field is locked and says where to change it (§3); a runtime field is an admin's to change */
function EditCell({
  field,
  admin,
  onDialog,
}: {
  field: SchemaField
  admin: boolean
  onDialog: (dialog: Dialog) => void
}): ReactElement {
  if (!field.runtime) {
    return (
      <span className="setup-locked">
        <Lock aria-hidden="true" />
        Defined in code, change it in <code>krantho.collections.ts</code>; code always wins
      </span>
    )
  }
  if (!admin) return <span className="setup-muted">Admins edit runtime fields</span>
  return <RuntimeActions field={field.runtime} onDialog={onDialog} />
}

function columns(admin: boolean, onDialog: (dialog: Dialog) => void): DataColumn<SchemaField>[] {
  return [
    {
      id: 'field',
      header: 'Field',
      primary: true,
      cell: (f) => (
        <span className="setup-name">
          <code>{f.name}</code>
          {f.description && <span className="setup-muted">{f.description}</span>}
        </span>
      ),
    },
    { id: 'type', header: 'Type', cell: (f) => fieldTypeName(f.type) },
    { id: 'required', header: 'Required', cell: (f) => (f.required ? 'Required' : 'Optional') },
    {
      id: 'default',
      header: 'Default',
      cell: (f) => (f.defaultValue ? <code>{f.defaultValue}</code> : '—'),
    },
    {
      id: 'source',
      header: 'Source',
      cell: (f) =>
        f.source === 'code' ? <Chip icon={Lock}>Code</Chip> : <Chip tone="accent">Runtime</Chip>,
    },
    {
      id: 'edit',
      header: 'Edit',
      cell: (f) => <EditCell field={f} admin={admin} onDialog={onDialog} />,
    },
  ]
}

/** The collection's fields, read together: the merged schema and the runtime definitions */
function useFields(collection: string): ReturnType<typeof useLoaded<SchemaField[]>> {
  const load = useCallback(async () => {
    const [schema, runtime] = await Promise.all([
      fetchSchema(collection),
      fetchRuntimeSchema(collection),
    ])
    return schemaFields(schema, runtime.fields)
  }, [collection])
  return useLoaded(load, 'The fields could not be read')
}

export interface FieldsCardProps {
  collection: string
  collections: readonly CollectionInfo[]
  /** The API changes runtime fields for admins only */
  admin: boolean
}

function FieldsActions({
  admin,
  onDialog,
}: {
  admin: boolean
  onDialog: (dialog: Dialog) => void
}): ReactElement {
  return (
    <>
      <Button icon={FileCode} onClick={() => onDialog({ kind: 'export' })}>
        Export as Zod
      </Button>
      {admin && (
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => onDialog({ kind: 'edit', field: null })}
        >
          Add runtime field
        </Button>
      )}
    </>
  )
}

/** A collection's fields: code fields locked, runtime fields added, edited and deleted here */
export function FieldsCard({ collection, collections, admin }: FieldsCardProps): ReactElement {
  const { loaded, reload } = useFields(collection)
  const [dialog, setDialog] = useState<Dialog>(null)
  const label = collectionLabel(collection)
  const actions = <FieldsActions admin={admin} onDialog={setDialog} />
  return (
    <SetupSection title={`Fields of ${label}`} actions={actions} sources={<FieldSources />}>
      {loaded.state === 'loading' && <Loading what="the fields" />}
      {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
      {loaded.state === 'ready' && (
        <DataTable
          caption={`Fields of ${label}`}
          columns={columns(admin, setDialog)}
          rows={loaded.data}
          rowKey={(f) => `${f.source}:${f.name}`}
        />
      )}
      {dialog && (
        <FieldDialogs
          collection={collection}
          collections={collections}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
    </SetupSection>
  )
}

function FieldSources(): ReactElement {
  return (
    <>
      <ValuesFrom source="config">
        Code fields come from the collection's Zod schema in <code>krantho.collections.ts</code>,
        read-only here.
      </ValuesFrom>
      <ValuesFrom source="database">
        Runtime fields are stored in the site's database: added, edited and deleted here, and added
        to the collection's form at once.
      </ValuesFrom>
    </>
  )
}

/** Delete a runtime field, confirmed */
function DeleteField({
  collection,
  name,
  onDone,
  onClose,
}: {
  collection: string
  name: string
  onDone: (text: string) => void
  onClose: () => void
}): ReactElement {
  const remove = async (): Promise<void> => {
    await deleteRuntimeField(collection, name)
    onDone(`Deleted the runtime field ${name}.`)
  }
  return (
    <ConfirmModal
      title={`Delete the field ${name}?`}
      confirmLabel="Delete field"
      danger
      onConfirm={remove}
      onClose={onClose}
    >
      <p>
        The runtime field <code>{name}</code> is removed from {collectionLabel(collection)}'s
        schema, so its form no longer shows it.
      </p>
      <p>
        Only the schema changes. Documents keep the values they already hold in the field; the form
        no longer shows them.
      </p>
    </ConfirmModal>
  )
}

interface FieldDialogsProps {
  collection: string
  collections: readonly CollectionInfo[]
  dialog: NonNullable<Dialog>
  onClose: () => void
  /** A field was saved or deleted: read the fields again */
  onChanged: () => void
}

/** The open dialog: add or edit a field, confirm a delete, or the Zod export */
function FieldDialogs(props: FieldDialogsProps): ReactElement {
  const { collection, collections, dialog, onClose, onChanged } = props
  const toast = useToast()
  const done = (text: string): void => {
    toast({ text })
    onClose()
    onChanged()
  }
  if (dialog.kind === 'export') return <ZodExportModal collection={collection} onClose={onClose} />
  if (dialog.kind === 'delete') {
    return (
      <DeleteField
        collection={collection}
        name={dialog.field.name}
        onDone={done}
        onClose={onClose}
      />
    )
  }
  const save = async (field: RuntimeFieldDefinition): Promise<void> => {
    await saveRuntimeField(collection, field)
    done(`Saved the runtime field ${field.name}.`)
  }
  return (
    <FieldDialog
      collection={collection}
      field={dialog.field}
      collections={collections}
      onSave={save}
      onClose={onClose}
    />
  )
}
