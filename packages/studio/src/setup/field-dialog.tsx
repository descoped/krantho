import { type FormEvent, type ReactElement, useId, useState } from 'react'
import type { CollectionInfo, RuntimeFieldDefinition } from '../lib/api.js'
import { collectionLabel } from '../lib/format.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { ErrorLine } from './confirm-modal.js'
import {
  FIELD_TYPES,
  type FieldForm,
  fieldFormError,
  fieldOf,
  fieldTypeName,
  formOf,
  hasBounds,
} from './field-form.js'
import { CheckInput, SelectInput, TextInput } from './setup-inputs.js'
import { useBusyAction } from './use-busy-action.js'

type Setter = <K extends keyof FieldForm>(key: K) => (value: FieldForm[K]) => void

interface InputsProps {
  form: FieldForm
  set: Setter
}

const TYPE_OPTIONS = FIELD_TYPES.map((type) => ({ value: type, label: fieldTypeName(type) }))

/** A length for text, a range for a number */
function BoundsInputs({ form, set }: InputsProps): ReactElement {
  const number = form.type === 'number'
  return (
    <div className="setup-field-row">
      <TextInput
        label={number ? 'Minimum' : 'Minimum length'}
        type="number"
        value={form.min}
        onChange={set('min')}
      />
      <TextInput
        label={number ? 'Maximum' : 'Maximum length'}
        type="number"
        value={form.max}
        onChange={set('max')}
      />
    </div>
  )
}

/** The inputs that apply to the chosen type: enum values, the referenced collection, bounds, a pattern */
function TypeInputs(props: InputsProps & { collections: readonly CollectionInfo[] }): ReactElement {
  const { form, set, collections } = props
  const refs = [
    { value: '', label: 'Choose a collection' },
    ...collections.map((c) => ({ value: c.name, label: collectionLabel(c.name) })),
  ]
  const enumHint = 'Separated by commas'
  const patternHint = 'A regular expression the value must match'
  return (
    <>
      {form.type === 'enum' && (
        <TextInput
          label="Values"
          value={form.enumValues}
          onChange={set('enumValues')}
          hint={enumHint}
        />
      )}
      {form.type === 'reference' && (
        <SelectInput
          label="Refers to"
          value={form.refCollection}
          options={refs}
          onChange={set('refCollection')}
        />
      )}
      {hasBounds(form.type) && <BoundsInputs form={form} set={set} />}
      {form.type === 'string' && (
        <TextInput
          label="Pattern"
          value={form.pattern}
          onChange={set('pattern')}
          hint={patternHint}
        />
      )}
    </>
  )
}

function FieldInputs({
  form,
  set,
  editing,
  collections,
}: InputsProps & { editing: boolean; collections: readonly CollectionInfo[] }): ReactElement {
  const nameHint = editing ? 'A field keeps its name' : 'The key documents store its value under'
  const describe = 'Shown to editors under the field'
  return (
    <>
      <TextInput
        label="Name"
        value={form.name}
        onChange={set('name')}
        disabled={editing}
        hint={nameHint}
      />
      <SelectInput
        label="Type"
        value={form.type}
        options={TYPE_OPTIONS}
        onChange={set('type')}
        disabled={editing}
        hint={editing ? 'A field keeps its type' : undefined}
      />
      <CheckInput label="Required" checked={form.required} onChange={set('required')} />
      <TextInput
        label="Description"
        value={form.description}
        onChange={set('description')}
        hint={describe}
      />
      <TextInput label="Default" value={form.defaultValue} onChange={set('defaultValue')} />
      <TypeInputs form={form} set={set} collections={collections} />
    </>
  )
}

export interface FieldDialogProps {
  collection: string
  /** The runtime field being edited; null adds one */
  field: RuntimeFieldDefinition | null
  collections: readonly CollectionInfo[]
  onSave: (field: RuntimeFieldDefinition) => Promise<void>
  onClose: () => void
}

/** Add or edit a runtime field: stored in the database, added to the collection's form */
export function FieldDialog(props: FieldDialogProps): ReactElement {
  const { collection, field, collections, onSave, onClose } = props
  const formId = useId()
  const [form, setForm] = useState(() => formOf(field))
  const set: Setter = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const { busy, error, setError, run } = useBusyAction()
  function submit(event: FormEvent): void {
    event.preventDefault()
    const invalid = fieldFormError(form)
    if (invalid) {
      setError(invalid)
      return
    }
    void run(() => onSave(fieldOf(form)), 'The field could not be saved')
  }
  const title = field
    ? `Edit ${field.name}`
    : `Add a runtime field to ${collectionLabel(collection)}`
  const actions = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="submit" form={formId} aria-disabled={busy}>
        {busy ? 'Saving…' : 'Save field'}
      </Button>
    </>
  )
  return (
    <Modal title={title} onClose={onClose} actions={actions} busy={busy}>
      <form id={formId} className="setup-form" onSubmit={submit}>
        {error && <ErrorLine text={error} />}
        <FieldInputs form={form} set={set} editing={field !== null} collections={collections} />
      </form>
    </Modal>
  )
}
