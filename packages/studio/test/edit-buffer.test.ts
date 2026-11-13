import { describe, expect, it } from 'vitest'
import type { SeoConfigData, SeoConfigEntity } from '../src/lib/api-types.js'
import {
  addEntity,
  applyBuffer,
  bufferToConfigUpdate,
  changeEntityType,
  createBuffer,
  deleteEntity,
  entityKey,
  isDirty,
  nodeKey,
  removeProperty,
  setNestedProperty,
  setProperty,
} from '../src/lib/edit-buffer.js'
import { EDIT_KEY, type GraphModel, type GraphNode } from '../src/lib/jsonld-graph.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  type: string,
  props: Record<string, unknown> = {},
  role?: string,
): SeoConfigEntity {
  return {
    '@type': type,
    ...(role ? { role } : {}),
    properties: props,
  }
}

function makeNode(type: string, id?: string, props: Record<string, unknown> = {}): GraphNode {
  return {
    '@type': type,
    ...(id ? { '@id': id } : {}),
    ...props,
  } as GraphNode
}

function makeModel(nodes: GraphNode[]): GraphModel {
  const byEk = new Map<string, GraphNode>()
  const byId = new Map<string, GraphNode>()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    // Assign _ek if not present (test helper)
    if (!(EDIT_KEY in n)) {
      ;(n as Record<string, unknown>)[EDIT_KEY] = String(i)
    }
    const ek = n[EDIT_KEY]
    if (typeof ek === 'string') byEk.set(ek, n)
    const id = n['@id']
    if (typeof id === 'string') byId.set(id, n)
  }
  return { nodes, byEk, byId, referencedBy: new Map(), primary: null }
}

// ---------------------------------------------------------------------------
// createBuffer + isDirty
// ---------------------------------------------------------------------------

describe('createBuffer / isDirty', () => {
  it('creates an empty buffer that is not dirty', () => {
    const buf = createBuffer()
    expect(isDirty(buf)).toBe(false)
    expect(buf.overrides.size).toBe(0)
    expect(buf.removed.size).toBe(0)
    expect(buf.added.size).toBe(0)
    expect(buf.deleted.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// setProperty
// ---------------------------------------------------------------------------

describe('setProperty', () => {
  it('adds a property override', () => {
    let buf = createBuffer()
    buf = setProperty(buf, 'Article', 'headline', 'Hello')
    expect(isDirty(buf)).toBe(true)
    expect(buf.overrides.get('Article')).toEqual({ headline: 'Hello' })
  })

  it('accumulates multiple properties on the same entity', () => {
    let buf = createBuffer()
    buf = setProperty(buf, 'Article', 'headline', 'Hello')
    buf = setProperty(buf, 'Article', 'description', 'World')
    expect(buf.overrides.get('Article')).toEqual({ headline: 'Hello', description: 'World' })
  })

  it('overwrites an existing property', () => {
    let buf = createBuffer()
    buf = setProperty(buf, 'Article', 'headline', 'Hello')
    buf = setProperty(buf, 'Article', 'headline', 'Updated')
    expect(buf.overrides.get('Article')).toEqual({ headline: 'Updated' })
  })

  it('un-removes a property when setting it', () => {
    let buf = createBuffer()
    buf = removeProperty(buf, 'Article', 'headline')
    expect(buf.removed.get('Article')?.has('headline')).toBe(true)
    buf = setProperty(buf, 'Article', 'headline', 'Back')
    expect(buf.removed.has('Article')).toBe(false)
    expect(buf.overrides.get('Article')).toEqual({ headline: 'Back' })
  })
})

// ---------------------------------------------------------------------------
// setNestedProperty
// ---------------------------------------------------------------------------

describe('setNestedProperty', () => {
  it('sets a single-level path like setProperty', () => {
    let buf = createBuffer()
    buf = setNestedProperty(buf, 'ProfessionalService', ['name'], 'Acme', {})
    expect(buf.overrides.get('ProfessionalService')).toEqual({ name: 'Acme' })
  })

  it('sets a nested path inside a sub-entity', () => {
    const current = {
      address: { '@type': 'PostalAddress', streetAddress: '123 Main', addressLocality: 'Oslo' },
    }
    let buf = createBuffer()
    buf = setNestedProperty(
      buf,
      'ProfessionalService',
      ['address', 'streetAddress'],
      '456 New',
      current,
    )
    const addr = buf.overrides.get('ProfessionalService')?.address as Record<string, unknown>
    expect(addr.streetAddress).toBe('456 New')
    expect(addr.addressLocality).toBe('Oslo')
    expect(addr['@type']).toBe('PostalAddress')
  })

  it('creates intermediate objects when path does not exist', () => {
    let buf = createBuffer()
    buf = setNestedProperty(buf, 'Event', ['location', 'address', 'city'], 'Oslo', {})
    const loc = buf.overrides.get('Event')?.location as Record<string, unknown>
    const addr = loc.address as Record<string, unknown>
    expect(addr.city).toBe('Oslo')
  })

  it('returns unchanged buffer for empty path', () => {
    const buf = createBuffer()
    const result = setNestedProperty(buf, 'X', [], 'v', {})
    expect(result).toBe(buf)
  })
})

// ---------------------------------------------------------------------------
// removeProperty
// ---------------------------------------------------------------------------

describe('removeProperty', () => {
  it('marks a property as removed', () => {
    let buf = createBuffer()
    buf = removeProperty(buf, 'Article', 'headline')
    expect(isDirty(buf)).toBe(true)
    expect(buf.removed.get('Article')?.has('headline')).toBe(true)
  })

  it('also cleans up overrides', () => {
    let buf = createBuffer()
    buf = setProperty(buf, 'Article', 'headline', 'Hello')
    buf = removeProperty(buf, 'Article', 'headline')
    expect(buf.overrides.has('Article')).toBe(false)
    expect(buf.removed.get('Article')?.has('headline')).toBe(true)
  })

  it('accumulates multiple removed properties', () => {
    let buf = createBuffer()
    buf = removeProperty(buf, 'Article', 'headline')
    buf = removeProperty(buf, 'Article', 'description')
    const removed = buf.removed.get('Article')
    expect(removed?.has('headline')).toBe(true)
    expect(removed?.has('description')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// addEntity
// ---------------------------------------------------------------------------

describe('addEntity', () => {
  it('adds an entity to the buffer', () => {
    let buf = createBuffer()
    buf = addEntity(buf, makeEntity('Person', { name: 'John' }, 'author'))
    expect(isDirty(buf)).toBe(true)
    expect(buf.added.has('Person:author')).toBe(true)
  })

  it('un-deletes an entity when adding it back', () => {
    let buf = createBuffer()
    buf = deleteEntity(buf, 'Person')
    expect(buf.deleted.has('Person')).toBe(true)
    buf = addEntity(buf, makeEntity('Person', {}))
    expect(buf.deleted.has('Person')).toBe(false)
    expect(buf.added.has('Person')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// deleteEntity
// ---------------------------------------------------------------------------

describe('deleteEntity', () => {
  it('marks an entity as deleted', () => {
    let buf = createBuffer()
    buf = deleteEntity(buf, 'Article')
    expect(isDirty(buf)).toBe(true)
    expect(buf.deleted.has('Article')).toBe(true)
  })

  it('removes an added entity instead of marking deleted', () => {
    let buf = createBuffer()
    buf = addEntity(buf, makeEntity('Person', {}))
    buf = deleteEntity(buf, 'Person')
    expect(buf.added.has('Person')).toBe(false)
    expect(buf.deleted.has('Person')).toBe(false)
  })

  it('cleans up overrides and removed sets for deleted entities', () => {
    let buf = createBuffer()
    buf = setProperty(buf, 'Article', 'headline', 'Hello')
    buf = removeProperty(buf, 'Article', 'description')
    buf = deleteEntity(buf, 'Article')
    expect(buf.overrides.has('Article')).toBe(false)
    expect(buf.removed.has('Article')).toBe(false)
    expect(buf.deleted.has('Article')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// changeEntityType
// ---------------------------------------------------------------------------

describe('changeEntityType', () => {
  it('changes type for an added entity', () => {
    let buf = createBuffer()
    buf = addEntity(buf, makeEntity('Article', { headline: 'Test' }))
    buf = changeEntityType(buf, 'Article', 'BlogPosting')
    const entity = buf.added.get('Article')
    expect(entity?.['@type']).toBe('BlogPosting')
  })

  it('records type change as override for existing entity', () => {
    let buf = createBuffer()
    buf = changeEntityType(buf, 'Article', 'BlogPosting')
    expect(buf.overrides.get('Article')?.['@type']).toBe('BlogPosting')
  })

  it('still creates overrides for a deleted entity (does not guard against deleted)', () => {
    let buf = createBuffer()
    buf = deleteEntity(buf, 'Article')
    buf = changeEntityType(buf, 'Article', 'BlogPosting')
    expect(buf.deleted.has('Article')).toBe(true)
    // changeEntityType delegates to setProperty which does not check the deleted set,
    // so overrides are created even though the entity is marked deleted.
    expect(buf.overrides.get('Article')?.['@type']).toBe('BlogPosting')
  })
})

// ---------------------------------------------------------------------------
// applyBuffer
// ---------------------------------------------------------------------------

describe('applyBuffer', () => {
  it('returns the same model when buffer is empty', () => {
    const model = makeModel([makeNode('Article', '#article', { headline: 'Test' })])
    const result = applyBuffer(model, createBuffer())
    expect(result).toBe(model)
  })

  it('applies property overrides to nodes via _ek', () => {
    const model = makeModel([makeNode('Article', '#article', { headline: 'Old' })])
    let buf = createBuffer()
    buf = setProperty(buf, '0', 'headline', 'New') // _ek = "0"
    const result = applyBuffer(model, buf)
    expect(result.nodes[0]?.headline).toBe('New')
  })

  it('removes deleted nodes via _ek', () => {
    const model = makeModel([makeNode('Article', '#article'), makeNode('Person', '#person')])
    let buf = createBuffer()
    buf = deleteEntity(buf, '0') // _ek = "0" → Article
    const result = applyBuffer(model, buf)
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0]?.['@type']).toBe('Person')
  })

  it('appends added entities', () => {
    const model = makeModel([makeNode('Article', '#article')])
    let buf = createBuffer()
    buf = addEntity(buf, makeEntity('Person', { name: 'Jane' }))
    const result = applyBuffer(model, buf)
    expect(result.nodes.length).toBe(2)
    expect(result.nodes[1]?.['@type']).toBe('Person')
    expect(result.nodes[1]?.name).toBe('Jane')
  })

  it('strips removed properties via _ek', () => {
    const model = makeModel([makeNode('Article', '#a', { headline: 'H', description: 'D' })])
    let buf = createBuffer()
    buf = removeProperty(buf, '0', 'description') // _ek = "0"
    const result = applyBuffer(model, buf)
    expect(result.nodes[0]?.headline).toBe('H')
    expect(result.nodes[0]?.description).toBeUndefined()
  })

  it('applies both overrides and removals on the same entity via _ek', () => {
    const model = makeModel([
      makeNode('Article', '#article', { headline: 'H', description: 'D', image: 'img.jpg' }),
    ])
    let buf = createBuffer()
    buf = setProperty(buf, '0', 'headline', 'Updated')
    buf = removeProperty(buf, '0', 'description')
    const result = applyBuffer(model, buf)
    expect(result.nodes[0]?.headline).toBe('Updated')
    expect(result.nodes[0]?.description).toBeUndefined()
    expect(result.nodes[0]?.image).toBe('img.jpg')
  })
})

// ---------------------------------------------------------------------------
// bufferToConfigUpdate
// ---------------------------------------------------------------------------

describe('bufferToConfigUpdate', () => {
  const existing: SeoConfigData = {
    entities: [
      makeEntity('Article', { headline: 'Old', description: 'Desc' }),
      makeEntity('Person', { name: 'John' }, 'author'),
    ],
  }

  // Edit keys map: _ek "0" → config entity 0 (Article), "1" → config entity 1 (Person)
  const ekMap = new Map<string, number>([
    ['0', 0],
    ['1', 1],
  ])

  it('returns unchanged config for empty buffer', () => {
    const result = bufferToConfigUpdate(createBuffer(), existing, ekMap)
    expect(result.entities.length).toBe(2)
    expect(result.entities[0]?.properties.headline).toBe('Old')
  })

  it('applies property overrides via _ek', () => {
    let buf = createBuffer()
    buf = setProperty(buf, '0', 'headline', 'New')
    const result = bufferToConfigUpdate(buf, existing, ekMap)
    expect(result.entities[0]?.properties.headline).toBe('New')
    expect(result.entities[0]?.properties.description).toBe('Desc')
  })

  it('removes deleted entities via _ek', () => {
    let buf = createBuffer()
    buf = deleteEntity(buf, '1')
    const result = bufferToConfigUpdate(buf, existing, ekMap)
    expect(result.entities.length).toBe(1)
    expect(result.entities[0]?.['@type']).toBe('Article')
  })

  it('strips removed properties via _ek', () => {
    let buf = createBuffer()
    buf = removeProperty(buf, '0', 'description')
    const result = bufferToConfigUpdate(buf, existing, ekMap)
    expect(result.entities[0]?.properties.headline).toBe('Old')
    expect(result.entities[0]?.properties.description).toBeUndefined()
  })

  it('appends added entities', () => {
    let buf = createBuffer()
    buf = addEntity(buf, makeEntity('BreadcrumbList', {}, 'navigation'))
    const result = bufferToConfigUpdate(buf, existing, ekMap)
    expect(result.entities.length).toBe(3)
    expect(result.entities[2]?.['@type']).toBe('BreadcrumbList')
    expect(result.entities[2]?.role).toBe('navigation')
  })

  it('applies type change via _ek override', () => {
    let buf = createBuffer()
    buf = changeEntityType(buf, '0', 'BlogPosting')
    const result = bufferToConfigUpdate(buf, existing, ekMap)
    expect(result.entities[0]?.['@type']).toBe('BlogPosting')
    expect(result.entities[0]?.properties.headline).toBe('Old')
  })

  it('preserves fieldMappings', () => {
    const withMappings: SeoConfigData = {
      ...existing,
      fieldMappings: { 'Article.headline': 'title' },
    }
    const result = bufferToConfigUpdate(createBuffer(), withMappings, ekMap)
    expect(result.fieldMappings).toEqual({ 'Article.headline': 'title' })
  })

  it('keeps the page structure and the site robots.txt beside the entities', () => {
    const site: SeoConfigData = {
      ...existing,
      structure: { kind: 'item' },
      robotsTxt: 'User-agent: *\nDisallow: /private/',
    }
    const result = bufferToConfigUpdate(createBuffer(), site, ekMap)
    expect(result.structure).toEqual({ kind: 'item' })
    expect(result.robotsTxt).toBe('User-agent: *\nDisallow: /private/')
  })

  it('preserves @id on config entities (never modified)', () => {
    const config: SeoConfigData = {
      entities: [
        {
          '@type': 'Article',
          '@id': 'https://example.com/#article',
          properties: { headline: 'H' },
        },
      ],
    }
    const map = new Map<string, number>([['0', 0]])
    const result = bufferToConfigUpdate(createBuffer(), config, map)
    expect(result.entities[0]?.['@id']).toBe('https://example.com/#article')
  })

  it('edits to two services with different _ek do not collide', () => {
    const config: SeoConfigData = {
      entities: [
        { '@type': 'Service', properties: { name: 'S1' } },
        { '@type': 'Service', properties: { name: 'S2' } },
      ],
    }
    const map = new Map<string, number>([
      ['0', 0],
      ['1', 1],
    ])
    let buf = createBuffer()
    buf = setProperty(buf, '0', 'name', 'Updated S1')
    buf = setProperty(buf, '1', 'name', 'Updated S2')
    const result = bufferToConfigUpdate(buf, config, map)
    expect(result.entities[0]?.properties.name).toBe('Updated S1')
    expect(result.entities[1]?.properties.name).toBe('Updated S2')
  })

  it('strips @id from nested objects in properties on save', () => {
    const config: SeoConfigData = {
      entities: [
        {
          '@type': 'ProfessionalService',
          '@id': 'https://example.com/#business',
          properties: {
            name: 'Biz',
            address: {
              '@type': 'PostalAddress',
              '@id': 'https://example.com/#business/address',
              streetAddress: '123 Main St',
            },
            openingHoursSpecification: [
              {
                '@type': 'OpeningHoursSpecification',
                '@id': 'https://example.com/#business/openingHoursSpecification/0',
                dayOfWeek: ['Monday'],
              },
            ],
          },
        },
      ],
    }
    const map = new Map<string, number>([['0', 0]])
    const result = bufferToConfigUpdate(createBuffer(), config, map)
    // Entity @id preserved
    expect(result.entities[0]?.['@id']).toBe('https://example.com/#business')
    // Nested @id stripped
    const address = result.entities[0]?.properties.address as Record<string, unknown>
    expect(address['@type']).toBe('PostalAddress')
    expect(address['@id']).toBeUndefined()
    expect(address.streetAddress).toBe('123 Main St')
    // Array item nested @id stripped
    const hours = result.entities[0]?.properties.openingHoursSpecification as Record<
      string,
      unknown
    >[]
    expect(hours[0]?.['@type']).toBe('OpeningHoursSpecification')
    expect(hours[0]?.['@id']).toBeUndefined()
    expect(hours[0]?.dayOfWeek).toEqual(['Monday'])
  })
})

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

describe('entityKey', () => {
  it('prefers @id when present', () => {
    const entity = { '@type': 'Article', '@id': '#article', properties: {} }
    expect(entityKey(entity)).toBe('#article')
  })

  it('falls back to type for entities without @id', () => {
    expect(entityKey(makeEntity('Article'))).toBe('Article')
  })

  it('falls back to type:role for entities with role but no @id', () => {
    expect(entityKey(makeEntity('Person', {}, 'author'))).toBe('Person:author')
  })
})

describe('nodeKey', () => {
  it('returns _ek when present', () => {
    const node = { '@type': 'Article', '@id': '#article', [EDIT_KEY]: '5' } as GraphNode
    expect(nodeKey(node)).toBe('5')
  })

  it('falls back to @type when no _ek (defensive)', () => {
    expect(nodeKey(makeNode('Article'))).toBe('Article')
  })

  it('returns unknown for untyped nodes without _ek', () => {
    expect(nodeKey({} as GraphNode)).toBe('unknown')
  })
})
