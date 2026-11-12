import { describe, expect, it } from 'vitest'
import {
  getAutoMappableProperties,
  getCatalogByCategory,
  getCatalogType,
  getDocumentLevelTypes,
  getRequiredProperties,
  getSiteLevelTypes,
  getTypeProperties,
  resolveAutoMappings,
  SCHEMA_CATALOG,
} from '../src/catalog/index.js'

describe('Schema.org Type Catalog', () => {
  it('contains curated types', () => {
    expect(SCHEMA_CATALOG.length).toBeGreaterThanOrEqual(20)
  })

  it('every type has required fields', () => {
    for (const type of SCHEMA_CATALOG) {
      expect(type.type).toBeTruthy()
      expect(type.label).toBeTruthy()
      expect(type.description).toBeTruthy()
      expect(type.category).toBeTruthy()
    }
  })

  it('looks up type by name', () => {
    const article = getCatalogType('Article')
    expect(article).toBeDefined()
    expect(article!.label).toBe('Article')
    expect(article!.category).toBe('content')
  })

  it('returns undefined for unknown type', () => {
    expect(getCatalogType('NonExistent')).toBeUndefined()
  })

  it('filters by category', () => {
    const business = getCatalogByCategory('business')
    expect(business.length).toBeGreaterThanOrEqual(3)
    expect(business.every((t) => t.category === 'business')).toBe(true)
  })

  it('returns site-level types', () => {
    const siteTypes = getSiteLevelTypes()
    expect(siteTypes.some((t) => t.type === 'LocalBusiness')).toBe(true)
    expect(siteTypes.some((t) => t.type === 'WebSite')).toBe(true)
    expect(siteTypes.every((t) => t.siteLevel)).toBe(true)
  })

  it('returns document-level types', () => {
    const docTypes = getDocumentLevelTypes()
    expect(docTypes.some((t) => t.type === 'Article')).toBe(true)
    expect(docTypes.some((t) => t.type === 'Service')).toBe(true)
    expect(docTypes.every((t) => t.documentLevel)).toBe(true)
  })
})

describe('Type Properties', () => {
  it('every catalog type has properties defined', () => {
    for (const type of SCHEMA_CATALOG) {
      expect(
        getTypeProperties(type.type).length,
        `Missing properties for ${type.type}`,
      ).toBeGreaterThan(0)
    }
  })

  it("takes each property's importance from Google's rule for the type", () => {
    // Google: "There are no required properties" for Article
    expect(getRequiredProperties('Article')).toEqual([])
    const article = Object.fromEntries(
      getTypeProperties('Article').map((p) => [p.property, p.importance]),
    )
    expect(article['headline']).toBe('recommended')
    expect(article['author']).toBe('recommended')
    const event = Object.fromEntries(
      getTypeProperties('Event').map((p) => [p.property, p.importance]),
    )
    expect(event['startDate']).toBe('required')
    expect(event['location']).toBe('required')
  })

  it('makes no property important for a feature Google retired', () => {
    expect(getTypeProperties('HowTo').every((p) => p.importance === 'optional')).toBe(true)
  })

  it('auto-mappable properties have autoMapField', () => {
    const auto = getAutoMappableProperties('Article')
    expect(auto.length).toBeGreaterThan(0)
    for (const prop of auto) {
      expect(prop.autoMapField).toBeTruthy()
    }
  })
})

describe('Auto-Mappings', () => {
  it('resolves CMS fields to Schema.org properties', () => {
    const cmsFields = ['title', 'description', 'meta-description', 'date']
    const schemaProps = ['name', 'headline', 'description', 'datePublished']

    const mappings = resolveAutoMappings(cmsFields, schemaProps)

    expect(mappings.get('name')).toBe('title')
    expect(mappings.get('headline')).toBe('title')
    expect(mappings.get('description')).toBe('meta-description') // higher priority than description
    expect(mappings.get('datePublished')).toBe('date')
  })

  it('meta-description wins over description for Schema.org description', () => {
    const mappings = resolveAutoMappings(['description', 'meta-description'], ['description'])
    expect(mappings.get('description')).toBe('meta-description')
  })

  it('returns empty map when no CMS fields match', () => {
    const mappings = resolveAutoMappings(['custom-field'], ['name'])
    expect(mappings.size).toBe(0)
  })
})

describe('Catalog features from the Google profile', () => {
  it('derives feature, status and documentation from the rule', () => {
    expect(getCatalogType('WebSite')).toMatchObject({
      richResult: 'Site names',
      richResultStatus: 'active',
      docsUrl: 'https://developers.google.com/search/docs/appearance/site-names',
    })
    expect(getCatalogType('FAQPage')?.richResultStatus).toBe('retired')
    expect(getCatalogType('HowTo')?.richResultStatus).toBe('retired')
    expect(getCatalogType('Course')).toMatchObject({
      richResult: 'Course list',
      richResultStatus: 'active',
    })
  })

  it("uses a parent type's rule for a subtype without its own", () => {
    expect(getCatalogType('Restaurant')?.richResult).toBe('Local business')
    expect(getCatalogType('BlogPosting')?.richResult).toBe('Article')
  })

  it('has no feature for a type Google documents none for', () => {
    expect(getCatalogType('Service')).toMatchObject({
      richResult: null,
      richResultStatus: 'none',
      docsUrl: '',
    })
  })

  it('lists only current Schema.org types', () => {
    expect(SCHEMA_CATALOG.filter((t) => t.lifecycle && t.lifecycle.status !== 'pending')).toEqual(
      [],
    )
  })
})
