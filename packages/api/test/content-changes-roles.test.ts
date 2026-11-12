import { describe, expect, it } from 'vitest'
import { contentChanges } from '../src/handlers/content-changes.js'
import type { ApiRequest } from '../src/types.js'
import { editor, viewer } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const REQUEST: ApiRequest = { method: 'GET', path: '/api/changes', params: {}, query: {} }

describe('GET /api/changes needs an editor', () => {
  it('refuses a viewer, which is what an anonymous reader is on an open API', async () => {
    const res = await contentChanges(REQUEST, testContext(viewer, testStores()))
    expect(res.status).toBe(403)
  })

  it('lets an editor past the role check', async () => {
    // The test stores hold no content import: past the role check, the handler says so
    const res = await contentChanges(REQUEST, testContext(editor, testStores()))
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })
})
