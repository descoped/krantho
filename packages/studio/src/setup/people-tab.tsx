import { type LucideIcon, Pencil, Power, Trash2, UserPlus } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { createUser, deleteUser, fetchUsers, type UserAccount, updateUser } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { formatDateTime } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button, type ButtonVariant } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { useToast } from '../ui/toast.js'
import { ConfirmModal } from './confirm-modal.js'
import { personName, ROLES, roleOf } from './people-model.js'
import { type PersonChanges, PersonDialog } from './person-dialog.js'
import { LoadError, Loading, SetupSection, ValuesFrom } from './setup-section.js'

type Dialog = { kind: 'create' } | { kind: 'edit' | 'active' | 'delete'; user: UserAccount } | null

const roleLabel = (user: UserAccount): string =>
  ROLES.find((role) => role.value === roleOf(user))?.label ?? roleOf(user)

interface RowButton {
  kind: 'edit' | 'active' | 'delete'
  label: string
  icon: LucideIcon
  variant: ButtonVariant
}

/** Edit for everyone; Deactivate and Delete for every account but your own (the API refuses those) */
function rowButtons(user: UserAccount, self: boolean): RowButton[] {
  const edit: RowButton = { kind: 'edit', label: 'Edit', icon: Pencil, variant: 'secondary' }
  if (self) return [edit]
  const toggle = user.isActive ? 'Deactivate' : 'Activate'
  return [
    edit,
    { kind: 'active', label: toggle, icon: Power, variant: 'ghost' },
    { kind: 'delete', label: 'Delete', icon: Trash2, variant: 'ghost' },
  ]
}

function PersonActions({
  user,
  self,
  onDialog,
}: {
  user: UserAccount
  self: boolean
  onDialog: (dialog: Dialog) => void
}): ReactElement {
  const name = personName(user)
  const buttons = rowButtons(user, self)
  return (
    <span className="setup-row-actions">
      {buttons.map((button) => (
        <Button
          key={button.kind}
          size="sm"
          variant={button.variant}
          icon={button.icon}
          aria-label={`${button.label} ${name}`}
          onClick={() => onDialog({ kind: button.kind, user })}
        >
          {button.label}
        </Button>
      ))}
    </span>
  )
}

function columns(
  self: string | undefined,
  onDialog: (dialog: Dialog) => void,
): DataColumn<UserAccount>[] {
  const role = (u: UserAccount): ReactElement => (
    <Chip tone={roleOf(u) === 'admin' ? 'accent' : 'neutral'}>{roleLabel(u)}</Chip>
  )
  const status = (u: UserAccount): ReactElement =>
    u.isActive ? <Chip tone="success">Active</Chip> : <Chip>Deactivated</Chip>
  return [
    {
      id: 'name',
      header: 'Person',
      primary: true,
      cell: (u) => u.name || <span className="setup-muted">No name</span>,
    },
    { id: 'email', header: 'Email', cell: (u) => u.email ?? '—' },
    { id: 'role', header: 'Role', cell: role },
    { id: 'status', header: 'Status', cell: status },
    {
      id: 'sign-in',
      header: 'Signs in with',
      cell: (u) => (u.oidcIssuer ? 'OIDC provider' : 'Studio'),
    },
    { id: 'created', header: 'Created', cell: (u) => formatDateTime(u.createdAt) },
    {
      id: 'actions',
      header: 'Actions',
      cell: (u) => <PersonActions user={u} self={u.id === self} onDialog={onDialog} />,
    },
  ]
}

/** Create user or Edit, sent to the API; says what it did */
async function savePerson(user: UserAccount | null, changes: PersonChanges): Promise<string> {
  if (!user) {
    const created = await createUser({
      email: changes.email,
      name: changes.name || undefined,
      role: changes.role,
    })
    return `Created ${personName(created)} as ${changes.role}.`
  }
  await updateUser(user.id, { name: changes.name, role: changes.role })
  return `Saved ${personName(user)}: ${changes.role}.`
}

/** Deactivate, Activate or Delete, sent to the API; says what it did */
async function changeAccount(kind: 'active' | 'delete', user: UserAccount): Promise<string> {
  if (kind === 'delete') {
    await deleteUser(user.id)
    return `Deleted ${personName(user)}.`
  }
  await updateUser(user.id, { isActive: !user.isActive })
  return `${user.isActive ? 'Deactivated' : 'Activated'} ${personName(user)}.`
}

function ActiveConfirm({
  user,
  onConfirm,
  onClose,
}: {
  user: UserAccount
  onConfirm: () => Promise<void>
  onClose: () => void
}): ReactElement {
  const deactivate = user.isActive
  const verb = deactivate ? 'Deactivate' : 'Activate'
  return (
    <ConfirmModal
      title={`${verb} ${personName(user)}?`}
      confirmLabel={verb}
      danger={deactivate}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p>
        {deactivate
          ? 'They can no longer sign in, and their sessions can no longer be renewed; a session already open lasts until its access token expires.'
          : 'They can sign in again, with their role.'}
      </p>
    </ConfirmModal>
  )
}

function PeopleDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: NonNullable<Dialog>
  onClose: () => void
  onDone: (text: string) => void
}): ReactElement {
  if (dialog.kind === 'create' || dialog.kind === 'edit') {
    const user = dialog.kind === 'edit' ? dialog.user : null
    const save = async (changes: PersonChanges): Promise<void> =>
      onDone(await savePerson(user, changes))
    return <PersonDialog user={user} onSave={save} onClose={onClose} />
  }
  const { kind, user } = dialog
  const confirm = async (): Promise<void> => onDone(await changeAccount(kind, user))
  if (kind === 'active') return <ActiveConfirm user={user} onConfirm={confirm} onClose={onClose} />
  return (
    <ConfirmModal
      title={`Delete ${personName(user)}?`}
      confirmLabel="Delete account"
      danger
      onConfirm={confirm}
      onClose={onClose}
    >
      <p>The account is removed from the site's database.</p>
    </ConfirmModal>
  )
}

/** Setup › People: the accounts, with Create user, Edit (name and role), Deactivate and Delete */
export function PeopleTab(): ReactElement {
  const toast = useToast()
  const self = useAuth().user?.id
  const { loaded, reload } = useLoaded(fetchUsers, 'The accounts could not be read')
  const [dialog, setDialog] = useState<Dialog>(null)
  const done = (text: string): void => {
    setDialog(null)
    toast({ text })
    reload()
  }
  const sources = (
    <ValuesFrom source="database">
      The accounts in the site's database. Roles are site-wide: admin &gt; editor &gt; viewer. The
      API does not record when someone was last active.
    </ValuesFrom>
  )
  const actions = (
    <Button variant="primary" icon={UserPlus} onClick={() => setDialog({ kind: 'create' })}>
      Create user
    </Button>
  )
  return (
    <SetupSection title="People" sources={sources} actions={actions}>
      {loaded.state === 'loading' && <Loading what="the accounts" />}
      {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
      {loaded.state === 'ready' && (
        <DataTable
          caption="People"
          columns={columns(self, setDialog)}
          rows={loaded.data}
          rowKey={(u) => u.id}
        />
      )}
      {dialog && <PeopleDialog dialog={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </SetupSection>
  )
}
