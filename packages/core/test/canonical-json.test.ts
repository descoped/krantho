import { describe, expect, it } from 'vitest'
import { canonicalJson } from '../src/canonical-json.js'

describe('canonicalJson', () => {
  it('sorts keys by code unit at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, Z: 2 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"Z":2,"z":1}]},"b":1}',
    )
  })

  it('serializes equal values identically, whatever the key order', () => {
    expect(canonicalJson({ x: 1, y: [1, 2] })).toBe(canonicalJson({ y: [1, 2], x: 1 }))
  })

  it('leaves out undefined properties and keeps array order', () => {
    expect(canonicalJson({ a: undefined, b: [3, 1] })).toBe('{"b":[3,1]}')
  })

  it('writes dates as ISO strings', () => {
    expect(canonicalJson(new Date('2026-10-09T00:00:00Z'))).toBe('"2026-10-09T00:00:00.000Z"')
  })
})
