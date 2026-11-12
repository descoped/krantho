import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteAuthAdapter } from '../src/auth-adapter.js'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'

let db: Database.Database
let auth: SqliteAuthAdapter

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db, sqliteMigrations)
  auth = new SqliteAuthAdapter(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteAuthAdapter', () => {
  describe('users', () => {
    it('creates and retrieves a user', async () => {
      const user = await auth.createUser({
        email: 'admin@example.com',
        name: 'Admin',
        roles: ['admin'],
      })

      expect(user.email).toBe('admin@example.com')
      expect(user.roles).toEqual(['admin'])
      expect(user.isActive).toBe(true)

      const found = await auth.getUser(user.id)
      expect(found).not.toBeNull()
      expect(found!.email).toBe('admin@example.com')
    })

    it('finds user by email', async () => {
      await auth.createUser({ email: 'test@example.com', name: 'Test', roles: ['viewer'] })
      const found = await auth.getUserByEmail('test@example.com')
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Test')
    })

    it('finds user by OIDC identity', async () => {
      await auth.createUser({
        email: 'oidc@example.com',
        name: 'OIDC User',
        roles: ['editor'],
        oidcIssuer: 'https://accounts.google.com',
        oidcSubject: 'google-123',
      })

      const found = await auth.getUserByOidc('https://accounts.google.com', 'google-123')
      expect(found).not.toBeNull()
      expect(found!.email).toBe('oidc@example.com')
    })

    it('returns null for nonexistent user', async () => {
      expect(await auth.getUser('nonexistent')).toBeNull()
      expect(await auth.getUserByEmail('nobody@example.com')).toBeNull()
      expect(await auth.getUserByOidc('issuer', 'sub')).toBeNull()
    })

    it('updates user fields', async () => {
      const user = await auth.createUser({
        email: 'old@example.com',
        name: 'Old',
        roles: ['viewer'],
      })
      const updated = await auth.updateUser(user.id, { name: 'New', roles: ['admin'] })

      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('New')
      expect(updated!.roles).toEqual(['admin'])
    })

    it('deactivates a user', async () => {
      const user = await auth.createUser({
        email: 'active@example.com',
        name: 'Active',
        roles: ['viewer'],
      })
      await auth.updateUser(user.id, { isActive: false })

      const found = await auth.getUser(user.id)
      expect(found!.isActive).toBe(false)
    })

    it('deletes a user', async () => {
      const user = await auth.createUser({
        email: 'delete@example.com',
        name: 'Delete',
        roles: ['viewer'],
      })
      const deleted = await auth.deleteUser(user.id)
      expect(deleted).toBe(true)

      expect(await auth.getUser(user.id)).toBeNull()
    })

    it('lists all users', async () => {
      await auth.createUser({ email: 'a@example.com', name: 'A', roles: ['admin'] })
      await auth.createUser({ email: 'b@example.com', name: 'B', roles: ['editor'] })

      const users = await auth.listUsers()
      expect(users).toHaveLength(2)
    })
  })

  describe('refresh tokens', () => {
    it('creates and finds refresh token by hash', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['admin'],
      })
      const expiresAt = new Date(Date.now() + 86400000).toISOString()
      await auth.createRefreshToken(user.id, 'hash-abc', expiresAt)

      const found = await auth.getRefreshTokenByHash('hash-abc')
      expect(found).not.toBeNull()
      expect(found!.userId).toBe(user.id)
    })

    it('returns null for nonexistent hash', async () => {
      expect(await auth.getRefreshTokenByHash('nonexistent')).toBeNull()
    })

    it('deletes a refresh token', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['admin'],
      })
      const expiresAt = new Date(Date.now() + 86400000).toISOString()
      const id = await auth.createRefreshToken(user.id, 'hash-del', expiresAt)

      await auth.deleteRefreshToken(id)
      expect(await auth.getRefreshTokenByHash('hash-del')).toBeNull()
    })

    it('deletes all tokens for a user', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['admin'],
      })
      const expiresAt = new Date(Date.now() + 86400000).toISOString()
      await auth.createRefreshToken(user.id, 'hash-1', expiresAt)
      await auth.createRefreshToken(user.id, 'hash-2', expiresAt)

      await auth.deleteUserRefreshTokens(user.id)
      expect(await auth.getRefreshTokenByHash('hash-1')).toBeNull()
      expect(await auth.getRefreshTokenByHash('hash-2')).toBeNull()
    })

    it('deletes expired tokens', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['admin'],
      })
      const expired = new Date(Date.now() - 86400000).toISOString()
      const valid = new Date(Date.now() + 86400000).toISOString()
      await auth.createRefreshToken(user.id, 'hash-expired', expired)
      await auth.createRefreshToken(user.id, 'hash-valid', valid)

      const deleted = await auth.deleteExpiredRefreshTokens()
      expect(deleted).toBe(1)

      expect(await auth.getRefreshTokenByHash('hash-expired')).toBeNull()
      expect(await auth.getRefreshTokenByHash('hash-valid')).not.toBeNull()
    })

    it('cascades on user delete', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['admin'],
      })
      const expiresAt = new Date(Date.now() + 86400000).toISOString()
      await auth.createRefreshToken(user.id, 'hash-cascade', expiresAt)

      await auth.deleteUser(user.id)
      expect(await auth.getRefreshTokenByHash('hash-cascade')).toBeNull()
    })
  })

  describe('permissions', () => {
    it('sets and retrieves per-collection permissions', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['viewer'],
      })
      await auth.setUserPermission(user.id, 'blog', 'editor')

      const perms = await auth.getUserPermissions(user.id)
      expect(perms).toHaveLength(1)
      expect(perms[0]!.collection).toBe('blog')
      expect(perms[0]!.role).toBe('editor')
    })

    it('upserts permission (update existing)', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['viewer'],
      })
      await auth.setUserPermission(user.id, 'blog', 'editor')
      await auth.setUserPermission(user.id, 'blog', 'admin')

      const perms = await auth.getUserPermissions(user.id)
      expect(perms).toHaveLength(1)
      expect(perms[0]!.role).toBe('admin')
    })

    it('deletes a permission', async () => {
      const user = await auth.createUser({
        email: 'user@example.com',
        name: 'User',
        roles: ['viewer'],
      })
      await auth.setUserPermission(user.id, 'blog', 'editor')

      const deleted = await auth.deleteUserPermission(user.id, 'blog')
      expect(deleted).toBe(true)

      const perms = await auth.getUserPermissions(user.id)
      expect(perms).toHaveLength(0)
    })
  })
})
