import { describe, expect, it } from 'vitest'
import { changedByFromAuth, hasRole, requireRole } from '../src/permissions.js'
import type { AuthenticatedUser } from '../src/types.js'

function makeUser(roles: Array<'admin' | 'editor' | 'viewer'>): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    roles,
    mode: 'token',
  }
}

describe('hasRole', () => {
  it('admin has all roles', () => {
    const admin = makeUser(['admin'])
    expect(hasRole(admin, 'admin')).toBe(true)
    expect(hasRole(admin, 'editor')).toBe(true)
    expect(hasRole(admin, 'viewer')).toBe(true)
  })

  it('editor has editor and viewer', () => {
    const editor = makeUser(['editor'])
    expect(hasRole(editor, 'admin')).toBe(false)
    expect(hasRole(editor, 'editor')).toBe(true)
    expect(hasRole(editor, 'viewer')).toBe(true)
  })

  it('viewer only has viewer', () => {
    const viewer = makeUser(['viewer'])
    expect(hasRole(viewer, 'admin')).toBe(false)
    expect(hasRole(viewer, 'editor')).toBe(false)
    expect(hasRole(viewer, 'viewer')).toBe(true)
  })
})

describe('requireRole', () => {
  it('returns null when user has sufficient role', () => {
    const admin = makeUser(['admin'])
    expect(requireRole(admin, 'editor')).toBeNull()
  })

  it('returns 403 when role is insufficient', () => {
    const viewer = makeUser(['viewer'])
    const result = requireRole(viewer, 'editor')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })

  it('returns 401 when no user provided', () => {
    const result = requireRole(undefined, 'viewer')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })
})

describe('changedByFromAuth', () => {
  it('formats as role:email', () => {
    const admin = makeUser(['admin'])
    expect(changedByFromAuth(admin)).toBe('admin:test@example.com')
  })

  it('uses first role', () => {
    const user = makeUser(['editor'])
    expect(changedByFromAuth(user)).toBe('editor:test@example.com')
  })

  it('returns api when no user', () => {
    expect(changedByFromAuth(undefined)).toBe('api')
  })
})
