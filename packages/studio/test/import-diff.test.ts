import { describe, expect, it } from 'vitest'
import { createBuffer } from '../src/lib/edit-buffer.js'
import {
  applySelectedChanges,
  buildIdMap,
  parseAndDiff,
  rewriteIds,
  type SelectedChange,
} from '../src/lib/import-diff.js'
import { parseGraph } from '../src/lib/jsonld-graph.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currentGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      '@id': 'https://example.com/#article',
      headline: 'Current Title',
      description: 'Current description',
      datePublished: '2026-01-01',
    },
    {
      '@type': 'Person',
      '@id': 'https://example.com/#person',
      name: 'Jane Doe',
    },
  ],
}

const currentModel = parseGraph(currentGraph)
const currentTypes = new Set(['Article', 'Person', 'BreadcrumbList'])
const catalogProps = new Map([
  [
    'Article',
    new Set(['headline', 'description', 'datePublished', 'dateModified', 'image', 'author']),
  ],
  ['Person', new Set(['name', 'jobTitle', 'sameAs'])],
])

// ---------------------------------------------------------------------------
// parseAndDiff
// ---------------------------------------------------------------------------

describe('parseAndDiff', () => {
  it('detects added properties', () => {
    const imported = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          headline: 'Current Title',
          description: 'Current description',
          datePublished: '2026-01-01',
          dateModified: '2026-02-01',
        },
      ],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    expect(diff.error).toBeUndefined()
    const article = diff.entities.find((e) => e.type === 'Article')
    expect(article).toBeDefined()
    const added = article?.changes.find((c) => c.property === 'dateModified')
    expect(added?.kind).toBe('added')
    expect(added?.newValue).toBe('2026-02-01')
  })

  it('detects changed properties', () => {
    const imported = JSON.stringify({
      '@graph': [
        {
          '@type': 'Article',
          headline: 'New Title',
          description: 'Current description',
          datePublished: '2026-01-01',
        },
      ],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    const article = diff.entities.find((e) => e.type === 'Article')
    const changed = article?.changes.find((c) => c.property === 'headline')
    expect(changed?.kind).toBe('changed')
    expect(changed?.oldValue).toBe('Current Title')
    expect(changed?.newValue).toBe('New Title')
  })

  it('detects removed properties', () => {
    const imported = JSON.stringify({
      '@graph': [{ '@type': 'Article', headline: 'Current Title' }],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    const article = diff.entities.find((e) => e.type === 'Article')
    const removed = article?.changes.filter((c) => c.kind === 'removed')
    expect(removed?.length).toBeGreaterThan(0)
    expect(removed?.find((c) => c.property === 'description')).toBeDefined()
  })

  it('handles malformed JSON', () => {
    const diff = parseAndDiff('{ invalid json }}', currentModel, currentTypes, catalogProps)
    expect(diff.error).toContain('Invalid JSON')
    expect(diff.entities).toHaveLength(0)
  })

  it('handles empty blob', () => {
    const diff = parseAndDiff('{}', currentModel, currentTypes, catalogProps)
    expect(diff.error).toContain('No entities found')
  })

  it('handles single-entity JSON-LD', () => {
    const imported = JSON.stringify({
      '@type': 'Article',
      headline: 'Single Entity Title',
      description: 'Current description',
      datePublished: '2026-01-01',
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    expect(diff.error).toBeUndefined()
    const article = diff.entities.find((e) => e.type === 'Article')
    const changed = article?.changes.find((c) => c.property === 'headline')
    expect(changed?.kind).toBe('changed')
  })

  it('flags unknown entity types as disabled', () => {
    const imported = JSON.stringify({
      '@graph': [{ '@type': 'Recipe', name: 'Test Recipe' }],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    const recipe = diff.entities.find((e) => e.type === 'Recipe')
    expect(recipe?.disabled).toBe(true)
    expect(recipe?.disabledReason).toContain('Recipe')
  })

  it('flags unknown properties with warning', () => {
    const imported = JSON.stringify({
      '@graph': [{ '@type': 'Article', headline: 'Title', customField: 'custom value' }],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    const article = diff.entities.find((e) => e.type === 'Article')
    const custom = article?.changes.find((c) => c.property === 'customField')
    expect(custom?.unknownProperty).toBe(true)
  })

  it('triggers size gate on large imports', () => {
    const props: Record<string, unknown> = { '@type': 'Article' }
    for (let i = 0; i < 12; i++) {
      props[`prop${i}`] = `value${i}`
    }
    const imported = JSON.stringify({ '@graph': [props] })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    expect(diff.requiresConfirmation).toBe(true)
  })

  it('does not trigger size gate on small imports', () => {
    const imported = JSON.stringify({
      '@graph': [{ '@type': 'Article', headline: 'New' }],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    expect(diff.requiresConfirmation).toBe(false)
  })

  it('produces no entities for identical import', () => {
    const imported = JSON.stringify(currentGraph)
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    expect(diff.error).toBeUndefined()
    expect(diff.entities.length).toBe(0)
    expect(diff.totalPropertyChanges).toBe(0)
  })

  it('matches entities by (@type, role) tuple', () => {
    const imported = JSON.stringify({
      '@graph': [{ '@type': 'Person', name: 'Updated Name' }],
    })
    const diff = parseAndDiff(imported, currentModel, currentTypes, catalogProps)
    const person = diff.entities.find((e) => e.type === 'Person')
    const changed = person?.changes.find((c) => c.property === 'name')
    expect(changed?.kind).toBe('changed')
    expect(changed?.oldValue).toBe('Jane Doe')
  })
})

// ---------------------------------------------------------------------------
// rewriteIds
// ---------------------------------------------------------------------------

describe('rewriteIds', () => {
  const idMap = new Map([
    ['https://competitor.com/#article', 'https://example.com/#article'],
    ['https://competitor.com/#person', 'https://example.com/#person'],
  ])

  it('rewrites @id in a reference object', () => {
    const result = rewriteIds({ '@id': 'https://competitor.com/#article' }, idMap)
    expect(result).toEqual({ '@id': 'https://example.com/#article' })
  })

  it('rewrites nested @id values', () => {
    const result = rewriteIds({ author: { '@id': 'https://competitor.com/#person' } }, idMap)
    expect(result).toEqual({ author: { '@id': 'https://example.com/#person' } })
  })

  it('rewrites @id in arrays', () => {
    const result = rewriteIds(
      [{ '@id': 'https://competitor.com/#article' }, { '@id': 'https://competitor.com/#person' }],
      idMap,
    )
    expect(result).toEqual([
      { '@id': 'https://example.com/#article' },
      { '@id': 'https://example.com/#person' },
    ])
  })

  it('preserves external @id not in map', () => {
    const result = rewriteIds({ '@id': 'https://external.com/#thing' }, idMap)
    expect(result).toEqual({ '@id': 'https://external.com/#thing' })
  })

  it('handles primitives unchanged', () => {
    expect(rewriteIds('hello', idMap)).toBe('hello')
    expect(rewriteIds(42, idMap)).toBe(42)
    expect(rewriteIds(null, idMap)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildIdMap
// ---------------------------------------------------------------------------

describe('buildIdMap', () => {
  it('maps imported @id to current @id for matching entities', () => {
    const imported = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': 'https://competitor.com/#article', headline: 'Test' },
      ],
    })
    const map = buildIdMap(imported, currentModel, 'https://example.com')
    expect(map.get('https://competitor.com/#article')).toBe('https://example.com/#article')
  })

  it('generates conventional @id for entities without current match', () => {
    const imported = parseGraph({
      '@graph': [{ '@type': 'Recipe', '@id': 'https://other.com/#recipe', name: 'Test' }],
    })
    const map = buildIdMap(imported, currentModel, 'https://example.com')
    expect(map.get('https://other.com/#recipe')).toBe('https://example.com/#recipe')
  })

  it('generates one slash when the base URL ends in one', () => {
    const imported = parseGraph({
      '@graph': [{ '@type': 'Recipe', '@id': 'https://other.com/#recipe', name: 'Test' }],
    })
    const map = buildIdMap(imported, currentModel, 'https://example.com/')
    expect(map.get('https://other.com/#recipe')).toBe('https://example.com/#recipe')
  })
})

// ---------------------------------------------------------------------------
// applySelectedChanges
// ---------------------------------------------------------------------------

describe('applySelectedChanges', () => {
  it('applies selected changes to the buffer using entityId', () => {
    const changes: SelectedChange[] = [
      {
        entityType: 'Article',
        entityRole: undefined,
        entityId: 'https://example.com/#article',
        property: 'headline',
        value: 'Imported Title',
        kind: 'added',
      },
      {
        entityType: 'Article',
        entityRole: undefined,
        entityId: 'https://example.com/#article',
        property: 'dateModified',
        value: '2026-03-01',
        kind: 'added',
      },
    ]
    const idMap = new Map<string, string>()
    const buffer = applySelectedChanges(createBuffer(), changes, idMap)
    expect(buffer.overrides.get('https://example.com/#article')?.['headline']).toBe(
      'Imported Title',
    )
    expect(buffer.overrides.get('https://example.com/#article')?.['dateModified']).toBe(
      '2026-03-01',
    )
  })

  it('falls back to type key when entityId is undefined', () => {
    const changes: SelectedChange[] = [
      {
        entityType: 'Article',
        entityRole: undefined,
        entityId: undefined,
        property: 'headline',
        value: 'Imported',
        kind: 'added',
      },
    ]
    const buffer = applySelectedChanges(createBuffer(), changes, new Map())
    expect(buffer.overrides.get('Article')?.['headline']).toBe('Imported')
  })

  it('rewrites @id values in applied changes', () => {
    const changes: SelectedChange[] = [
      {
        entityType: 'Article',
        entityRole: undefined,
        entityId: 'https://example.com/#article',
        property: 'author',
        value: { '@id': 'https://old.com/#person' },
        kind: 'added',
      },
    ]
    const idMap = new Map([['https://old.com/#person', 'https://example.com/#person']])
    const buffer = applySelectedChanges(createBuffer(), changes, idMap)
    expect(buffer.overrides.get('https://example.com/#article')?.['author']).toEqual({
      '@id': 'https://example.com/#person',
    })
  })

  it('uses role in entity key when no entityId', () => {
    const changes: SelectedChange[] = [
      {
        entityType: 'Person',
        entityRole: 'author',
        entityId: undefined,
        property: 'name',
        value: 'New Author',
        kind: 'changed',
      },
    ]
    const buffer = applySelectedChanges(createBuffer(), changes, new Map())
    expect(buffer.overrides.get('Person:author')?.['name']).toBe('New Author')
  })
})
