import { describe, expect, it } from 'vitest'
import { articleId, businessId, documentId } from '../src/graph/id-conventions.js'

const BASE = 'https://example.com'

describe('entity @ids', () => {
  it('reads the page URL with one trailing slash, then the fragment', () => {
    expect(articleId(BASE, '/about')).toBe('https://example.com/about/#article')
    expect(businessId(BASE)).toBe('https://example.com/#business')
  })

  it('gives the home page one slash, never two', () => {
    expect(articleId(BASE, '/')).toBe('https://example.com/#article')
  })

  it('takes a base URL or a path that already ends in a slash', () => {
    expect(documentId(`${BASE}/`, '/about/', 'article')).toBe('https://example.com/about/#article')
    expect(documentId(`${BASE}/`, '', 'website')).toBe('https://example.com/#website')
  })
})
