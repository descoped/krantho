import { type FormEvent, type ReactElement, useId, useState } from 'react'
import type { UserAccount } from '../lib/api.js'
import type { Role } from '../lib/auth.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { ErrorLine } from './confirm-modal.js'
import { personName, ROLES, roleOf } from './people-model.js'
import { SelectInput, TextInput } from './setup-inputs.js'
import { useBusyAction } from './use-busy-action.js'

/** What the dialog saves: a new account's email, name and role, or an account's name and role */
export interface PersonChanges {
  email: string
  name: string
  role: Role
}

const ROLE_OPTIONS = ROLES.map((role) => ({
  value: role.value,
  label: `${role.label} — ${role.can}`,
}))

function PersonInputs({
  form,
  setForm,
  editing,
}: {
  form: PersonChanges
  setForm: (form: PersonChanges) => void
  editing: boolean
}): ReactElement {
  const emailHint = editing ? 'An account keeps its email' : 'They sign in with this address'
  const roleHint = 'Roles are site-wide: admin > editor > viewer'
  return (
    <>
      <TextInput
        label="Email"
        type="email"
        value={form.email}
        disabled={editing}
        onChange={(email) => setForm({ ...form, email })}
        hint={emailHint}
      />
      <TextInput label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <SelectInput
        label="Role"
        value={form.role}
        options={ROLE_OPTIONS}
        onChange={(role) => setForm({ ...form, role })}
        hint={roleHint}
      />
    </>
  )
}

export interface PersonDialogProps {
  /** The account being edited; null creates one */
  user: UserAccount | null
  onSave: (changes: PersonChanges) => Promise<void>
  onClose: () => void
}

/** Create user, or Edit: email (new accounts only), name and role */
export function PersonDialog({ user, onSave, onClose }: PersonDialogProps): ReactElement {
  const formId = useId()
  const [form, setForm] = useState<PersonChanges>(() => ({
    email: user?.email ?? '',
    name: user?.name ?? '',
    role: user ? roleOf(user) : 'viewer',
  }))
  const { busy, error, setError, run } = useBusyAction()
  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!user && !form.email.trim()) {
      setError('An account needs an email.')
      return
    }
    const changes = { ...form, email: form.email.trim(), name: form.name.trim() }
    void run(() => onSave(changes), 'The account could not be saved')
  }
  const actions = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="submit" form={formId} aria-disabled={busy}>
        {busy ? 'Saving…' : user ? 'Save' : 'Create user'}
      </Button>
    </>
  )
  const title = user ? `Edit ${personName(user)}` : 'Create user'
  return (
    <Modal title={title} onClose={onClose} actions={actions} busy={busy}>
      <form id={formId} className="setup-form" onSubmit={submit}>
        {error && <ErrorLine text={error} />}
        <PersonInputs form={form} setForm={setForm} editing={user !== null} />
      </form>
    </Modal>
  )
}
