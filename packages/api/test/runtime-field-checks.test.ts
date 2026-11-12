import { describe, expect, it } from 'vitest'
import { saveRuntimeField } from '../src/handlers/save-runtime-field.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { admin } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

function put(body: Record<string, unknown>): ApiRequest {
  return {
    method: 'PUT',
    path: '/api/schema/pages/fields',
    params: { collection: 'pages' },
    query: {},
    body,
  }
}

function context(): ApiContext {
  return testContext(admin, testStores())
}

describe('a runtime field is saved only when it holds', () => {
  it.each([
    ['a name that is not one', { name: '9 lives', type: 'string' }],
    ['a pattern that does not compile', { name: 'code', type: 'string', pattern: '(' }],
    ['an enum with one value', { name: 'kind', type: 'enum', enumValues: ['only'] }],
    ['an enum of no text', { name: 'kind', type: 'enum', enumValues: [1, 2] }],
    [
      'an enum with a value that is not text',
      { name: 'kind', type: 'enum', enumValues: ['a', 1, 'b'] },
    ],
    ['an enum of one value twice', { name: 'kind', type: 'enum', enumValues: ['a', 'a'] }],
    ['a number default that is not a number', { name: 'n', type: 'number', default: 'abc' }],
    ['a boolean default that is not one', { name: 'b', type: 'boolean', default: 'yes' }],
    [
      'an enum default outside its values',
      { name: 'kind', type: 'enum', enumValues: ['a', 'b'], default: 'c' },
    ],
    ['a minimum above the maximum', { name: 'n', type: 'number', min: 5, max: 2 }],
    ['a reference to no collection', { name: 'ref', type: 'reference', refCollection: 'nope' }],
  ])('refuses %s with 400', async (_what, body) => {
    const ctx = context()
    const res = await saveRuntimeField(put(body), ctx)
    expect(res.status).toBe(400)
    expect(await ctx.adapter.getRuntimeSchema?.('pages')).toBeNull()
  })

  it('saves a field that holds, typed defaults and bounds included', async () => {
    const ctx = context()
    const body = { name: 'rating', type: 'number', default: 3, min: 1, max: 5 }
    expect((await saveRuntimeField(put(body), ctx)).status).toBe(200)
    const enumField = { name: 'kind', type: 'enum', enumValues: ['a', 'b'], default: 'a' }
    expect((await saveRuntimeField(put(enumField), ctx)).status).toBe(200)
  })

  it('keeps a field’s type: changing it answers 409', async () => {
    const ctx = context()
    expect((await saveRuntimeField(put({ name: 'rating', type: 'number' }), ctx)).status).toBe(200)
    const res = await saveRuntimeField(put({ name: 'rating', type: 'string' }), ctx)
    expect(res.status).toBe(409)
    expect(
      (await saveRuntimeField(put({ name: 'rating', type: 'number', required: true }), ctx)).status,
    ).toBe(200)
  })
})
