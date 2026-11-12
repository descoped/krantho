import type { SeoConfigData } from '@krantho/seo-shared'
import { describe, expect, it } from 'vitest'
import { withTypes } from '../src/seo/set-types'

describe('setting a scope’s types', () => {
  it('keeps the field mappings, the page structure and the robots.txt override', () => {
    const existing: SeoConfigData = {
      entities: [{ '@type': 'Organization', properties: { name: 'Acme' } }],
      fieldMappings: { 'Person.name': 'author-name' },
      structure: { kind: 'article' },
      robotsTxt: 'User-agent: *\nDisallow: /drafts\n',
    }
    expect(withTypes(existing, ['ProfessionalService', 'WebSite'])).toEqual({
      entities: [
        { '@type': 'ProfessionalService', properties: {} },
        { '@type': 'WebSite', properties: {} },
      ],
      fieldMappings: { 'Person.name': 'author-name' },
      structure: { kind: 'article' },
      robotsTxt: 'User-agent: *\nDisallow: /drafts\n',
    })
  })

  it('makes a configuration of the types alone for a scope with none', () => {
    expect(withTypes(undefined, ['Article'])).toEqual({
      entities: [{ '@type': 'Article', properties: {} }],
    })
  })
})
