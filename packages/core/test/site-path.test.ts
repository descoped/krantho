import { describe, expect, it } from 'vitest'
import { resolveSitePath } from '../src/site-path.js'

describe('resolveSitePath', () => {
  const base = 'http://localhost:4002/api/preview'

  it('keeps a path on the site', () => {
    expect(resolveSitePath('/about', base)?.href).toBe('http://localhost:4002/about')
    expect(resolveSitePath('/blog/a?page=2', base)?.search).toBe('?page=2')
    expect(resolveSitePath('/../about', base)?.pathname).toBe('/about')
  })

  it('refuses anything that leaves the site or reads as another host', () => {
    for (const path of [
      '//evil.example',
      'https://evil.example/',
      '/\\evil.example',
      '/..//evil.example',
      '/.././/evil.example',
      '/a/../..//evil.example',
      '/..///evil.example',
      '/../\\evil.example',
      '/%5Cevil.example',
      '/%2F%2Fevil.example',
      '/%E0%A4%A',
    ]) {
      expect(resolveSitePath(path, base), path).toBeNull()
    }
  })
})
