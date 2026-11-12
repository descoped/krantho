import { describe, expect, it } from 'vitest'
import type { CatalogDetailResponse, CatalogType, PropertyDef } from '../src/lib/api-types.js'
import {
  buildEkConfigMap,
  CATEGORY_LABELS,
  type CatalogCategory,
  classifyGraphLayout,
  classifyNodeProperties,
  EDIT_KEY,
  entityCategory,
  type GraphNode,
  orderedProperties,
  parseGraph,
  typeString,
} from '../src/lib/jsonld-graph.js'
import { FULL_GRAPH, SITE_LEVEL_TYPES } from './fixtures/graph-fixtures.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function mkCatalogType(overrides: Partial<CatalogType> & Pick<CatalogType, 'type'>): CatalogType {
  return {
    type: overrides.type,
    label: overrides.label ?? overrides.type,
    description: overrides.description ?? '',
    richResult: overrides.richResult ?? null,
    richResultStatus: overrides.richResultStatus ?? 'none',
    docsUrl: overrides.docsUrl ?? `https://schema.org/${overrides.type}`,
    category: overrides.category ?? 'content',
    siteLevel: overrides.siteLevel ?? false,
    documentLevel: overrides.documentLevel ?? true,
  }
}

function mkPropertyDef(
  overrides: Partial<PropertyDef> & Pick<PropertyDef, 'property' | 'importance'>,
): PropertyDef {
  return {
    property: overrides.property,
    label: overrides.label ?? overrides.property,
    fieldType: overrides.fieldType ?? 'text',
    importance: overrides.importance,
    source: overrides.source ?? 'manual',
    ...(overrides.autoMapField ? { autoMapField: overrides.autoMapField } : {}),
    ...(overrides.hint ? { hint: overrides.hint } : {}),
  }
}

function mkCatalogDetail(
  type: string,
  properties: readonly PropertyDef[],
  overrides: Partial<CatalogType> = {},
): CatalogDetailResponse {
  return {
    type: mkCatalogType({ type, ...overrides }),
    properties,
    rules: [],
  }
}

// ---------------------------------------------------------------------------
// parseGraph
// ---------------------------------------------------------------------------

describe('parseGraph', () => {
  it('returns an empty model for null / undefined / empty object', () => {
    for (const input of [null, undefined, {}]) {
      const model = parseGraph(input)
      expect(model.nodes).toHaveLength(0)
      expect(model.byId.size).toBe(0)
      expect(model.referencedBy.size).toBe(0)
      expect(model.primary).toBeNull()
    }
  })

  it('returns an empty model for a @graph wrapper with no entries', () => {
    const model = parseGraph({ '@context': 'https://schema.org', '@graph': [] })
    expect(model.nodes).toHaveLength(0)
    expect(model.primary).toBeNull()
  })

  it('parses a single flat node without a @graph wrapper', () => {
    const flat = { '@type': 'Article', '@id': 'https://example.com/post', headline: 'Hello' }
    const model = parseGraph(flat)
    expect(model.nodes).toHaveLength(1)
    expect(model.nodes[0]?.['@type']).toBe('Article')
    expect(model.byId.get('https://example.com/post')).toBe(model.nodes[0])
  })

  it('parses a multi-node @graph and builds the byId index', () => {
    const model = parseGraph(FULL_GRAPH)
    expect(model.nodes).toHaveLength(5)
    expect(model.byId.size).toBe(5)
    expect(model.byId.get('https://example.com/#business')?.['@type']).toBe('ProfessionalService')
    expect(model.byId.get('https://example.com/services/strategy#service')?.['@type']).toBe(
      'Service',
    )
  })

  it('assigns _ek to all nodes and indexes them in byEk', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', headline: 'No ID' },
        { '@type': 'Person', '@id': 'p1', name: 'Ada' },
      ],
    })
    expect(model.nodes).toHaveLength(2)
    // All nodes have _ek and are in byEk
    expect(model.byEk.size).toBe(2)
    expect(model.nodes[0]?.[EDIT_KEY]).toBe('0')
    expect(model.nodes[1]?.[EDIT_KEY]).toBe('1')
    // byId only has nodes with semantic @id
    expect(model.byId.size).toBe(1)
    expect(model.byId.has('p1')).toBe(true)
    // @id is NOT modified on anonymous nodes
    expect(model.nodes[0]?.['@id']).toBeUndefined()
  })

  it('preserves @graph order in the nodes array', () => {
    const model = parseGraph(FULL_GRAPH)
    const types = model.nodes.map((n) => typeString(n['@type']))
    expect(types).toEqual(['ProfessionalService', 'WebSite', 'WebPage', 'Service', 'Person'])
  })

  it('skips non-object entries and objects without @type', () => {
    const model = parseGraph({
      '@graph': [{ '@type': 'Article', '@id': 'a1' }, 'not a node', 42, null, { '@id': 'no-type' }],
    })
    expect(model.nodes).toHaveLength(1)
    expect(model.nodes[0]?.['@id']).toBe('a1')
  })

  it('handles array-valued @type by using the first entry', () => {
    const model = parseGraph({
      '@graph': [{ '@type': ['Article', 'CreativeWork'], '@id': 'x' }],
    })
    expect(typeString(model.nodes[0]?.['@type'])).toBe('Article')
  })

  it('builds the reverse reference index from @id refs in properties', () => {
    const model = parseGraph(FULL_GRAPH)
    const businessRefs = model.referencedBy.get('https://example.com/#business')
    expect(businessRefs).toBeDefined()
    expect(businessRefs?.some((r) => r.property === 'publisher')).toBe(true)
    expect(businessRefs?.some((r) => r.property === 'provider')).toBe(true)
  })

  it('handles self-references without infinite loops', () => {
    const model = parseGraph({
      '@graph': [
        {
          '@type': 'Article',
          '@id': 'a',
          relatedTo: { '@id': 'a' },
        },
      ],
    })
    expect(model.nodes).toHaveLength(1)
    expect(model.referencedBy.get('a')?.length).toBe(1)
    expect(model.referencedBy.get('a')?.[0]?.property).toBe('relatedTo')
  })

  it('resolves the primary entity via WebPage.mainEntity', () => {
    const model = parseGraph(FULL_GRAPH)
    expect(model.primary).not.toBeNull()
    expect(model.primary?.['@id']).toBe('https://example.com/services/strategy#service')
  })

  it('leaves primary null when no page node is present', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': 'a', headline: 'X' },
        { '@type': 'Person', '@id': 'p', name: 'Ada' },
      ],
    })
    expect(model.primary).toBeNull()
  })

  it('leaves primary null when WebPage.mainEntity cannot be resolved', () => {
    const model = parseGraph({
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': 'page',
          mainEntity: { '@id': 'missing' },
        },
      ],
    })
    expect(model.primary).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// assignEditIds (via parseGraph)
// ---------------------------------------------------------------------------

describe('edit keys (_ek)', () => {
  it('assigns sequential _ek to every node regardless of @id', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': 'https://example.com/#article', headline: 'Hi' },
        { '@type': 'Service', name: 'S1' },
      ],
    })
    expect(model.nodes[0]?.[EDIT_KEY]).toBe('0')
    expect(model.nodes[1]?.[EDIT_KEY]).toBe('1')
    expect(model.byEk.size).toBe(2)
  })

  it('does not modify @id — _ek is a separate property', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': 'https://example.com/#article' },
        { '@type': 'Service', name: 'Anon' },
      ],
    })
    // @id preserved on nodes that have it, untouched on nodes that don't
    expect(model.nodes[0]?.['@id']).toBe('https://example.com/#article')
    expect(model.nodes[1]?.['@id']).toBeUndefined()
    // byId only has semantic @id, not _ek
    expect(model.byId.size).toBe(1)
    expect(model.byId.has('https://example.com/#article')).toBe(true)
  })

  it('every node in byEk regardless of @id presence', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Service', name: 'S1' },
        { '@type': 'Service', name: 'S2' },
        { '@type': 'Product', name: 'P1' },
      ],
    })
    expect(model.byEk.size).toBe(3)
    expect(model.byEk.get('0')?.[EDIT_KEY]).toBe('0')
    expect(model.byEk.get('1')?.[EDIT_KEY]).toBe('1')
    expect(model.byEk.get('2')?.[EDIT_KEY]).toBe('2')
    // @id is never set by _ek system
    expect(model.nodes[0]?.['@id']).toBeUndefined()
    expect(model.nodes[1]?.['@id']).toBeUndefined()
  })

  it('_ek is independent of @type — no collisions for same-type nodes', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Service', name: 'S1' },
        { '@type': 'Service', name: 'S2' },
      ],
    })
    // Both are addressable independently
    expect(model.byEk.get('0')?.['name']).toBe('S1')
    expect(model.byEk.get('1')?.['name']).toBe('S2')
  })
})

// ---------------------------------------------------------------------------
// buildEkConfigMap
// ---------------------------------------------------------------------------

describe('buildEkConfigMap', () => {
  it('matches nodes to config entities by @id', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': 'https://example.com/#article' },
        { '@type': 'WebSite', '@id': 'https://example.com/#website' },
      ],
    })
    const entities = [
      { '@type': 'WebSite', '@id': 'https://example.com/#website', properties: {} },
      { '@type': 'Article', '@id': 'https://example.com/#article', properties: {} },
    ]
    const map = buildEkConfigMap(model.nodes, entities)
    expect(map.get('0')).toBe(1) // Article node _ek=0 → entity index 1
    expect(map.get('1')).toBe(0) // WebSite node _ek=1 → entity index 0
  })

  it('falls back to @type match when no @id', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Service', name: 'S1' },
        { '@type': 'Person', name: 'P1' },
      ],
    })
    const entities = [
      { '@type': 'Person', properties: {} },
      { '@type': 'Service', properties: {} },
    ]
    const map = buildEkConfigMap(model.nodes, entities)
    expect(map.get('0')).toBe(1) // Service → entity 1
    expect(map.get('1')).toBe(0) // Person → entity 0
  })

  it('matches by @type + role', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Person', role: 'founder', name: 'Jane' },
        { '@type': 'Person', role: 'cto', name: 'John' },
      ],
    })
    const entities = [
      { '@type': 'Person', role: 'cto', properties: {} },
      { '@type': 'Person', role: 'founder', properties: {} },
    ]
    const map = buildEkConfigMap(model.nodes, entities)
    expect(map.get('0')).toBe(1) // founder node → founder entity (index 1)
    expect(map.get('1')).toBe(0) // cto node → cto entity (index 0)
  })

  it('omits nodes with no matching config entity', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Article', '@id': '#article' },
        { '@type': 'BreadcrumbList', '@id': '#breadcrumb' },
      ],
    })
    const entities = [{ '@type': 'Article', '@id': '#article', properties: {} }]
    const map = buildEkConfigMap(model.nodes, entities)
    expect(map.get('0')).toBe(0) // Article matched
    expect(map.has('1')).toBe(false) // BreadcrumbList has no config entity
  })

  it('does not reuse config entities for multiple nodes', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Service', name: 'S1' },
        { '@type': 'Service', name: 'S2' },
      ],
    })
    const entities = [{ '@type': 'Service', properties: {} }]
    const map = buildEkConfigMap(model.nodes, entities)
    expect(map.get('0')).toBe(0) // First Service gets the match
    expect(map.has('1')).toBe(false) // Second Service has no match (entity already used)
  })
})

// ---------------------------------------------------------------------------
// classifyGraphLayout
// ---------------------------------------------------------------------------

describe('classifyGraphLayout', () => {
  it('partitions a fully populated graph into all four sections', () => {
    const model = parseGraph(FULL_GRAPH)
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)

    expect(layout.siteContext.map((n) => typeString(n['@type']))).toEqual([
      'ProfessionalService',
      'WebSite',
    ])
    expect(typeString(layout.page?.['@type'])).toBe('WebPage')
    expect(typeString(layout.primary?.['@type'])).toBe('Service')
    // Person is not site-level in this test (not in SITE_LEVEL_TYPES set) and not the primary,
    // so it lands in linked.
    expect(layout.linked.map((n) => typeString(n['@type']))).toEqual(['Person'])
  })

  it('handles a site-context-only graph (no page, no primary)', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'Organization', '@id': 'org', name: 'X' },
        { '@type': 'WebSite', '@id': 'site', url: 'https://x' },
      ],
    })
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)
    expect(layout.siteContext).toHaveLength(2)
    expect(layout.page).toBeNull()
    expect(layout.primary).toBeNull()
    expect(layout.linked).toHaveLength(0)
  })

  it('falls back to first remaining node when page has no mainEntity', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'WebPage', '@id': 'page' },
        { '@type': 'Article', '@id': 'a', headline: 'X' },
        { '@type': 'Person', '@id': 'p', name: 'Ada' },
      ],
    })
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)
    expect(typeString(layout.primary?.['@type'])).toBe('Article')
    expect(layout.linked.map((n) => typeString(n['@type']))).toEqual(['Person'])
  })

  it('handles a page-only graph', () => {
    const model = parseGraph({
      '@graph': [{ '@type': 'FAQPage', '@id': 'faq' }],
    })
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)
    expect(typeString(layout.page?.['@type'])).toBe('FAQPage')
    expect(layout.primary).toBeNull()
    expect(layout.siteContext).toHaveLength(0)
    expect(layout.linked).toHaveLength(0)
  })

  it('returns an empty layout for an empty model', () => {
    const model = parseGraph(null)
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)
    expect(layout.siteContext).toHaveLength(0)
    expect(layout.page).toBeNull()
    expect(layout.primary).toBeNull()
    expect(layout.linked).toHaveLength(0)
  })

  it('handles multiple page-type nodes', () => {
    const model = parseGraph({
      '@graph': [
        { '@type': 'WebPage', '@id': 'wp', url: 'https://example.com/page' },
        { '@type': 'FAQPage', '@id': 'faq', url: 'https://example.com/faq' },
        { '@type': 'Article', '@id': 'a', headline: 'X' },
      ],
    })
    const layout = classifyGraphLayout(model, SITE_LEVEL_TYPES)
    // Only the first page-type node is selected as page
    expect(typeString(layout.page?.['@type'])).toBe('WebPage')
    // The second page-type node (FAQPage) is not surfaced in linked or siteContext —
    // classifyGraphLayout picks only the first page and discards the rest.
    expect(layout.linked.map((n) => typeString(n['@type']))).not.toContain('FAQPage')
    expect(layout.siteContext.map((n) => typeString(n['@type']))).not.toContain('FAQPage')
    // Article becomes primary (first remaining non-site node)
    expect(typeString(layout.primary?.['@type'])).toBe('Article')
  })
})

// ---------------------------------------------------------------------------
// entityCategory
// ---------------------------------------------------------------------------

describe('entityCategory', () => {
  const CATALOG: readonly CatalogType[] = [
    mkCatalogType({ type: 'ProfessionalService', category: 'business', siteLevel: true }),
    mkCatalogType({ type: 'WebSite', category: 'navigation' }),
    mkCatalogType({ type: 'WebPage', category: 'navigation' }),
    mkCatalogType({ type: 'Article', category: 'content' }),
    mkCatalogType({ type: 'Service', category: 'commerce' }),
    mkCatalogType({ type: 'Offer', category: 'commerce' }),
    mkCatalogType({ type: 'Person', category: 'people' }),
    mkCatalogType({ type: 'Review', category: 'reviews' }),
  ]

  it('returns the correct category for every one of the six catalog categories', () => {
    const expectations: ReadonlyArray<readonly [string, CatalogCategory]> = [
      ['ProfessionalService', 'business'],
      ['Article', 'content'],
      ['Service', 'commerce'],
      ['Person', 'people'],
      ['WebSite', 'navigation'],
      ['Review', 'reviews'],
    ]
    for (const [type, expected] of expectations) {
      const node: GraphNode = { '@type': type }
      expect(entityCategory(node, CATALOG)).toBe(expected)
    }
  })

  it('returns null for types not in the catalog', () => {
    const node: GraphNode = { '@type': 'Unicorn' }
    expect(entityCategory(node, CATALOG)).toBeNull()
  })

  it('handles array-valued @type by using the first entry', () => {
    const node: GraphNode = { '@type': ['Article', 'CreativeWork'] }
    expect(entityCategory(node, CATALOG)).toBe('content')
  })

  it('returns null for a node without @type', () => {
    const node = { name: 'X' } as unknown as GraphNode
    expect(entityCategory(node, CATALOG)).toBeNull()
  })

  it('falls back to null when the catalog entry has an unrecognized category string', () => {
    const badCatalog: readonly CatalogType[] = [
      mkCatalogType({ type: 'Article', category: 'not-a-category' as string }),
    ]
    const node: GraphNode = { '@type': 'Article' }
    expect(entityCategory(node, badCatalog)).toBeNull()
  })

  it('has human-readable labels for all six categories', () => {
    const categories: CatalogCategory[] = [
      'business',
      'content',
      'commerce',
      'people',
      'navigation',
      'reviews',
    ]
    for (const c of categories) {
      expect(CATEGORY_LABELS[c].length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// classifyNodeProperties
// ---------------------------------------------------------------------------

describe('classifyNodeProperties', () => {
  const ARTICLE_DETAIL = mkCatalogDetail('Article', [
    mkPropertyDef({ property: 'headline', importance: 'required' }),
    mkPropertyDef({ property: 'author', importance: 'required' }),
    mkPropertyDef({ property: 'datePublished', importance: 'recommended' }),
    mkPropertyDef({ property: 'description', importance: 'optional' }),
  ])

  it('classifies set properties against the catalog', () => {
    const node: GraphNode = {
      '@type': 'Article',
      '@id': 'a',
      headline: 'Hello',
      datePublished: '2026-01-01',
    }
    const result = classifyNodeProperties(node, ARTICLE_DETAIL)

    const headline = result.find((p) => p.property === 'headline')
    expect(headline?.state).toBe('set')
    expect(headline?.importance).toBe('required')
    expect(headline?.def?.label).toBe('headline')

    const author = result.find((p) => p.property === 'author')
    expect(author?.state).toBe('missing')
    expect(author?.importance).toBe('required')

    const datePublished = result.find((p) => p.property === 'datePublished')
    expect(datePublished?.state).toBe('set')
    expect(datePublished?.importance).toBe('recommended')

    const description = result.find((p) => p.property === 'description')
    expect(description?.state).toBe('missing')
    expect(description?.importance).toBe('optional')
  })

  it('includes unset catalog properties so missing required can be shown', () => {
    const node: GraphNode = { '@type': 'Article', '@id': 'a', headline: 'Hello' }
    const result = classifyNodeProperties(node, ARTICLE_DETAIL)
    expect(result.map((p) => p.property).sort()).toEqual(
      ['author', 'datePublished', 'description', 'headline'].sort(),
    )
    expect(result.find((p) => p.property === 'author')?.state).toBe('missing')
  })

  it('tags properties outside the catalog as unknown importance', () => {
    const node: GraphNode = {
      '@type': 'Article',
      '@id': 'a',
      customField: 'x',
    }
    const result = classifyNodeProperties(node, ARTICLE_DETAIL)
    const custom = result.find((p) => p.property === 'customField')
    expect(custom?.importance).toBe('unknown')
    expect(custom?.state).toBe('set')
    expect(custom?.def).toBeUndefined()
  })

  it('treats empty strings and empty arrays as missing', () => {
    const node: GraphNode = {
      '@type': 'Article',
      '@id': 'a',
      headline: '',
      author: [],
    }
    const result = classifyNodeProperties(node, ARTICLE_DETAIL)
    expect(result.find((p) => p.property === 'headline')?.state).toBe('missing')
    expect(result.find((p) => p.property === 'author')?.state).toBe('missing')
  })

  it('detects a direct @id cross-reference and captures the target id', () => {
    const node: GraphNode = {
      '@type': 'Article',
      '@id': 'a',
      author: { '@id': 'p1' },
    }
    const result = classifyNodeProperties(node, ARTICLE_DETAIL)
    const author = result.find((p) => p.property === 'author')
    expect(author?.isReference).toBe(true)
    expect(author?.referenceId).toBe('p1')
    expect(author?.state).toBe('set')
  })

  it('marks every classification as unknown when the catalog detail is null', () => {
    const node: GraphNode = { '@type': 'Unicorn', '@id': 'u', color: 'pink' }
    const result = classifyNodeProperties(node, null)
    expect(result).toHaveLength(1)
    expect(result[0]?.importance).toBe('unknown')
    expect(result[0]?.state).toBe('set')
  })

  it('never classifies @type / @id / @context themselves', () => {
    const node: GraphNode = {
      '@type': 'Article',
      '@id': 'a',
      '@context': 'https://schema.org',
      headline: 'Hello',
    }
    const result = classifyNodeProperties(node, null)
    expect(result.map((p) => p.property)).toEqual(['headline'])
  })
})

// ---------------------------------------------------------------------------
// orderedProperties
// ---------------------------------------------------------------------------

describe('orderedProperties', () => {
  const DETAIL = mkCatalogDetail('Thing', [
    mkPropertyDef({ property: 'alpha', importance: 'optional' }),
    mkPropertyDef({ property: 'beta', importance: 'required' }),
    mkPropertyDef({ property: 'gamma', importance: 'required' }),
    mkPropertyDef({ property: 'delta', importance: 'recommended' }),
    mkPropertyDef({ property: 'epsilon', importance: 'recommended' }),
  ])

  it('orders by rank: required-missing → recommended-missing → set → optional → unknown', () => {
    const node: GraphNode = {
      '@type': 'Thing',
      '@id': 't',
      beta: 'set-required', // required + set
      delta: 'set-recommended', // recommended + set
      // gamma is required + missing
      // epsilon is recommended + missing
      // alpha is optional + missing
      custom: 'x', // unknown + set
    }
    const classified = classifyNodeProperties(node, DETAIL)
    const ordered = orderedProperties(classified)

    // Expected order:
    // 0: gamma (required missing)
    // 1: epsilon (recommended missing)
    // 2: beta, custom, delta (set)
    // 3: alpha (optional)
    // 4: (none — everything got placed)
    expect(ordered.map((p) => p.property)).toEqual([
      'gamma',
      'epsilon',
      'beta',
      'custom',
      'delta',
      'alpha',
    ])
  })

  it('is a stable alphabetical sort within each rank', () => {
    const node: GraphNode = { '@type': 'Thing', '@id': 't' }
    const classified = classifyNodeProperties(node, DETAIL)
    const ordered = orderedProperties(classified)
    // Everything missing: required first (alphabetical), then recommended, then optional
    expect(ordered.map((p) => p.property)).toEqual(['beta', 'gamma', 'delta', 'epsilon', 'alpha'])
  })

  it('does not mutate the input array', () => {
    const input = classifyNodeProperties({ '@type': 'Thing', beta: 'x' } as GraphNode, DETAIL)
    const snapshot = [...input]
    orderedProperties(input)
    expect(input).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// typeString
// ---------------------------------------------------------------------------

describe('typeString', () => {
  it('returns the string when @type is a string', () => {
    expect(typeString('Article')).toBe('Article')
  })

  it('returns the first element when @type is a string array', () => {
    expect(typeString(['Article', 'CreativeWork'])).toBe('Article')
  })

  it('returns null for an empty array', () => {
    expect(typeString([])).toBeNull()
  })

  it('returns null for null / undefined / number', () => {
    expect(typeString(null)).toBeNull()
    expect(typeString(undefined)).toBeNull()
    expect(typeString(42)).toBeNull()
  })
})
