import type { UserAccount } from '../lib/api.js'
import type { Role } from '../lib/auth.js'

/** Site-wide roles, highest first: each can do what the ones below it can */
export const ROLES: readonly { value: Role; label: string; can: string }[] = [
  { value: 'admin', label: 'Admin', can: 'everything, including Setup and people' },
  { value: 'editor', label: 'Editor', can: 'writes, publishes and takes checkpoints' },
  { value: 'viewer', label: 'Viewer', can: 'reads' },
]

/** The account's role: the API keeps one per account, as a list */
export function roleOf(user: UserAccount): Role {
  return user.roles[0] ?? 'viewer'
}

/** How an account is named: its name, else its email, else its id */
export function personName(user: UserAccount): string {
  return user.name || user.email || user.id
}
