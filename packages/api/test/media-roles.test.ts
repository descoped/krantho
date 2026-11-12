import { describe, expect, it } from 'vitest'
import { mediaDelete } from '../src/handlers/media-delete.js'
import { mediaRegister } from '../src/handlers/media-register.js'
import { mediaUpload } from '../src/handlers/media-upload.js'
import type { ApiHandler, ApiRequest } from '../src/types.js'
import { editor, viewer } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

const WRITES: Array<[string, ApiHandler, ApiRequest]> = [
  ['upload', mediaUpload, { method: 'POST', path: '/api/media/upload', params: {}, query: {} }],
  [
    'register',
    mediaRegister,
    {
      method: 'POST',
      path: '/api/media/register',
      params: {},
      query: {},
      body: { filename: 'a.png', url: 'https://cdn.example.test/a.png' },
    },
  ],
  [
    'delete',
    mediaDelete,
    { method: 'DELETE', path: '/api/media/m1', params: { id: 'm1' }, query: {} },
  ],
]

describe('media writes need an editor', () => {
  it.each(WRITES)('refuses a viewer a media %s', async (_name, handler, req) => {
    const res = await handler(req, testContext(viewer, testStores()))
    expect(res.status).toBe(403)
  })

  it.each(WRITES)(
    'lets an editor past the role check for a media %s',
    async (_name, handler, req) => {
      // No media store in this context: past the role check, the handler says media is not set up
      const res = await handler(req, testContext(editor, testStores()))
      expect(res.status).not.toBe(403)
      expect(res.status).not.toBe(401)
    },
  )
})
