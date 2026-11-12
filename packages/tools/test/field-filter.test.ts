import { resolveConfig } from '@krantho/config'
import { describe, expect, it } from 'vitest'
import { createFieldFilter } from '../src/shared/markdown-utils'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

describe('createFieldFilter', () => {
  it('skips exact names and trailing-* prefixes', () => {
    const isSkipped = createFieldFilter(['description', 'form-*'])
    expect(isSkipped('description')).toBe(true)
    expect(isSkipped('form-title')).toBe(true)
    expect(isSkipped('form')).toBe(false)
    expect(isSkipped('title')).toBe(false)
  })

  it('skips by default the kinds of field every site has: descriptions, navigation, footer and forms', () => {
    const isSkipped = createFieldFilter(resolveConfig({ site }).tools.enrich.skipFields)
    for (const key of [
      'description',
      'meta-description',
      'meta-description-Approach',
      'footer-title',
      'nav-home',
      'nav-pricing',
      'form-name-label',
    ]) {
      expect(isSkipped(key)).toBe(true)
    }
    expect(isSkipped('title')).toBe(false)
  })

  it('carries no field name of one site: a site lists its own in its configuration', () => {
    const { skipFields } = resolveConfig({ site }).tools.enrich
    // Every entry is a kind of field, an exact generic name or a prefix
    expect(skipFields.filter((entry) => !entry.endsWith('*'))).toEqual([
      'description',
      'meta-description',
    ])
    const isSkipped = createFieldFilter(skipFields)
    expect(isSkipped('hero-image-alt')).toBe(false)
    expect(isSkipped('page-description')).toBe(false)
  })

  it('takes a project-specific list from the configuration', () => {
    const config = resolveConfig({ site, tools: { enrich: { skipFields: ['cert-*'] } } })
    const isSkipped = createFieldFilter(config.tools.enrich.skipFields)
    expect(isSkipped('cert-hdir-url')).toBe(true)
    expect(isSkipped('description')).toBe(false)
  })
})
