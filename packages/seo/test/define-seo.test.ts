import { afterEach, describe, expect, it } from 'vitest'
import { registeredDecorators } from '../src/decorators/index.js'
import { defineSeo } from '../src/define-seo.js'
import { getProfile } from '../src/profiles/index.js'
import { getTypeDefinition } from '../src/types/index.js'

describe('defineSeo', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it("registers a site's types, readers and decorators, and removes them on restore", () => {
    restore = defineSeo({
      types: [
        {
          type: 'Dataset',
          scope: 'document',
          idFragment: 'dataset',
          build: (context) => ({ '@type': context.type, '@id': context.id }),
        },
      ],
      profiles: [{ id: 'catalog', name: 'Catalog', rules: [] }],
      decorators: [{ id: 'mark', decorate: (graph) => graph }],
    })
    expect(getTypeDefinition('Dataset')?.idFragment).toBe('dataset')
    expect(getProfile('catalog')?.name).toBe('Catalog')
    expect(registeredDecorators().map((decorator) => decorator.id)).toContain('mark')

    restore()
    restore = undefined
    expect(getTypeDefinition('Dataset')).toBeUndefined()
    expect(getProfile('catalog')).toBeUndefined()
    expect(registeredDecorators().map((decorator) => decorator.id)).not.toContain('mark')
  })

  it('registers nothing when one of them is refused', () => {
    expect(() =>
      defineSeo({
        types: [
          {
            type: 'Dataset',
            scope: 'document',
            idFragment: 'dataset',
            build: (context) => ({ '@type': context.type, '@id': context.id }),
          },
        ],
        profiles: [
          {
            id: 'catalog',
            name: 'Catalog',
            rules: [
              {
                type: 'Atricle',
                status: 'active',
                source: 'https://example.org',
                verifiedAt: '2026-10-02',
              },
            ],
          },
        ],
      }),
    ).toThrow('Atricle')
    expect(getTypeDefinition('Dataset')).toBeUndefined()
    expect(getProfile('catalog')).toBeUndefined()
  })
})
