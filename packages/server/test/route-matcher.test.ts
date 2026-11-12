import { describe, expect, it } from 'vitest'
import { matchRoute, routeSpecificity } from '../src/route-matcher.js'

describe('matchRoute', () => {
  it('matches exact literal paths', () => {
    expect(matchRoute('/services/consulting', '/services/consulting')).toBe(true)
    expect(matchRoute('/services/consulting', '/services/advisory')).toBe(false)
  })

  it('does not match partial paths', () => {
    expect(matchRoute('/services', '/services/consulting')).toBe(false)
    expect(matchRoute('/services/consulting', '/services')).toBe(false)
  })

  it('matches single-segment wildcard', () => {
    expect(matchRoute('/services/*', '/services/consulting')).toBe(true)
    expect(matchRoute('/services/*', '/services/advisory')).toBe(true)
    expect(matchRoute('/services/*', '/services')).toBe(false)
    expect(matchRoute('/services/*', '/services/a/b')).toBe(false)
  })

  it('matches multi-segment wildcard', () => {
    expect(matchRoute('/services/**', '/services/consulting')).toBe(true)
    expect(matchRoute('/services/**', '/services/a/b')).toBe(true)
    expect(matchRoute('/services/**', '/services/a/b/c')).toBe(true)
    expect(matchRoute('/services/**', '/services')).toBe(false)
  })

  it('matches mixed literal and wildcard segments', () => {
    expect(matchRoute('/services/strategic/*', '/services/strategic/foo')).toBe(true)
    expect(matchRoute('/services/strategic/*', '/services/advisory/foo')).toBe(false)
    expect(matchRoute('/services/*/detail', '/services/foo/detail')).toBe(true)
    expect(matchRoute('/services/*/detail', '/services/foo/other')).toBe(false)
  })

  it('matches root path', () => {
    expect(matchRoute('/', '/')).toBe(true)
    expect(matchRoute('/', '/anything')).toBe(false)
  })

  it('handles trailing slashes consistently', () => {
    expect(matchRoute('/services', '/services')).toBe(true)
  })
})

describe('routeSpecificity', () => {
  it('scores literal segments higher than wildcards', () => {
    const literal = routeSpecificity('/services/consulting')
    const singleWild = routeSpecificity('/services/*')
    const multiWild = routeSpecificity('/services/**')

    expect(literal).toBeGreaterThan(singleWild)
    expect(singleWild).toBeGreaterThan(multiWild)
  })

  it('scores longer literal paths higher', () => {
    expect(routeSpecificity('/services/strategic/detail')).toBeGreaterThan(
      routeSpecificity('/services/strategic'),
    )
  })

  it('scores literal as 2, single-wild as 1, globstar as 0', () => {
    expect(routeSpecificity('/a/b')).toBe(4) // 2+2
    expect(routeSpecificity('/a/*')).toBe(3) // 2+1
    expect(routeSpecificity('/a/**')).toBe(2) // 2+0
  })
})
