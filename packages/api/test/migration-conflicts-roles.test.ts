import { describe, expect, it } from 'vitest'
import { migrationConflicts, resolveConflict } from '../src/handlers/migration-conflicts.js'
import type { ApiRequest } from '../src/types.js'
import { admin, editor, viewer } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const LIST: ApiRequest = { method: 'GET', path: '/api/migrations/conflicts', params: {}, query: {} }
const RESOLVE: ApiRequest = {
  method: 'POST',
  path: '/api/migrations/conflicts/1/resolve',
  params: { id: '1' },
  query: {},
  body: { resolution: 'use_repo' },
}

describe('GET /api/migrations/conflicts needs an editor', () => {
  it('refuses a viewer', async () => {
    const res = await migrationConflicts(LIST, testContext(viewer, testStores()))
    expect(res.status).toBe(403)
  })

  it('lets an editor past the role check', async () => {
    const res = await migrationConflicts(LIST, testContext(editor, testStores()))
    expect([401, 403]).not.toContain(res.status)
  })
})

describe('POST /api/migrations/conflicts/:id/resolve needs an admin', () => {
  it.each([
    ['a viewer', viewer],
    ['an editor', editor],
  ])('refuses %s', async (_name, user) => {
    const res = await resolveConflict(RESOLVE, testContext(user, testStores()))
    expect(res.status).toBe(403)
  })

  it('lets an admin past the role check', async () => {
    const res = await resolveConflict(RESOLVE, testContext(admin, testStores()))
    expect([401, 403]).not.toContain(res.status)
  })
})
