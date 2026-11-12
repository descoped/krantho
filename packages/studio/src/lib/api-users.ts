import { request } from './api-client.js'
import type { UserAccount } from './api-types.js'
import type { Role } from './auth.js'

/** Every user account (admins only) */
export async function fetchUsers(): Promise<UserAccount[]> {
  const { users } = await request<{ users: UserAccount[] }>('/users')
  return users
}

/** Create a user account ahead of its first sign-in */
export async function createUser(user: {
  email: string
  name?: string | undefined
  role: Role
}): Promise<UserAccount> {
  return request('/users', { method: 'POST', body: JSON.stringify(user) })
}

/** Change a user's name, role or whether the account is active */
export async function updateUser(
  id: string,
  changes: { name?: string | undefined; role?: Role | undefined; isActive?: boolean | undefined },
): Promise<UserAccount> {
  return request(`/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  })
}

/** Delete a user account */
export async function deleteUser(id: string): Promise<void> {
  await request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
