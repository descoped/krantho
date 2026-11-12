import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  enumerationsOf,
  getVocabularyProperty,
  getVocabularyType,
  isDatatype,
  isEnumeration,
  isPropertyOfType,
  isSubtypeOf,
  isVocabularyTerm,
  lifecycleOf,
  matchesDatatype,
  propertiesOf,
  rangeAcceptsType,
  SCHEMAORG_RELEASE,
  termName,
} from '../src/vocabulary/index.js'

describe('Schema.org vocabulary', () => {
  it('should be pinned to a Schema.org release', () => {
    expect(SCHEMAORG_RELEASE).toMatch(/^\d+\.\d+$/)
  })

  it('should know types, properties and their declared domain and range', () => {
    expect(getVocabularyType('Article')?.parents).toEqual(['CreativeWork'])
    expect(getVocabularyProperty('author')).toEqual({
      domain: ['CreativeWork', 'Rating'],
      range: ['Organization', 'Person'],
    })
    expect(getVocabularyType('NotAType')).toBeUndefined()
    expect(getVocabularyProperty('notAProperty')).toBeUndefined()
  })

  it('should not treat Object.prototype names as terms', () => {
    expect(getVocabularyType('constructor')).toBeUndefined()
    expect(getVocabularyProperty('toString')).toBeUndefined()
    expect(isVocabularyTerm('hasOwnProperty')).toBe(false)
  })

  it('should resolve inheritance', () => {
    expect(isSubtypeOf('TechArticle', 'Article')).toBe(true)
    expect(isSubtypeOf('TechArticle', 'Thing')).toBe(true)
    expect(isSubtypeOf('CollectionPage', 'WebPage')).toBe(true)
    expect(isSubtypeOf('Article', 'TechArticle')).toBe(false)
    expect(ancestorsOf('Unknown').size).toBe(0)
  })

  it('should resolve a property domain through inheritance', () => {
    expect(isPropertyOfType('author', 'TechArticle')).toBe(true)
    expect(isPropertyOfType('position', 'ListItem')).toBe(true)
    expect(isPropertyOfType('breadcrumb', 'WebPage')).toBe(true)
    expect(isPropertyOfType('breadcrumb', 'Article')).toBe(false)
    expect(propertiesOf('Article')).toContain('headline')
    expect(propertiesOf('Article')).toContain('name')
  })

  it('should check a property range against a type', () => {
    expect(rangeAcceptsType('author', 'Organization')).toBe(true)
    expect(rangeAcceptsType('author', 'Corporation')).toBe(true)
    expect(rangeAcceptsType('author', 'WebSite')).toBe(false)
    expect(rangeAcceptsType('logo', 'ImageObject')).toBe(true)
  })

  it('should tell data types and enumerations apart from classes', () => {
    expect(isDatatype('Text')).toBe(true)
    expect(isDatatype('URL')).toBe(true)
    expect(isDatatype('Integer')).toBe(true)
    expect(isDatatype('Person')).toBe(false)
    expect(isEnumeration('ItemAvailability')).toBe(true)
    expect(isEnumeration('Person')).toBe(false)
    expect(enumerationsOf('https://schema.org/InStock')).toEqual(['ItemAvailability'])
    expect(enumerationsOf('NotAMember')).toEqual([])
  })

  it('should report life-cycle status', () => {
    expect(lifecycleOf('Code')).toEqual({ status: 'superseded', by: 'SoftwareSourceCode' })
    expect(lifecycleOf('Article')).toBeUndefined()
    expect(lifecycleOf('https://schema.org/Article')).toBeUndefined()
    expect(termName('schema:Article')).toBe('Article')
  })

  it('should include retired terms with a retired status', () => {
    expect(lifecycleOf('variablesMeasured')).toEqual({ status: 'retired' })
    expect(isVocabularyTerm('variablesMeasured')).toBe(true)
  })

  it('should mark pending terms', () => {
    expect(lifecycleOf('AmpStory')?.status).toBe('pending')
  })
})

describe('matchesDatatype', () => {
  it('should check URLs', () => {
    expect(matchesDatatype('URL', 'https://example.com/a')).toBe(true)
    expect(matchesDatatype('URL', '/relative')).toBe(false)
    expect(matchesDatatype('URL', 'mailto:a@b.c')).toBe(false)
    expect(matchesDatatype('URL', 42)).toBe(false)
  })

  it('should check ISO 8601 dates and date-times', () => {
    expect(matchesDatatype('Date', '2026-10-02')).toBe(true)
    expect(matchesDatatype('Date', '2026-10')).toBe(true)
    expect(matchesDatatype('Date', 'yesterday')).toBe(false)
    expect(matchesDatatype('DateTime', '2026-10-02T12:00:00Z')).toBe(true)
    expect(matchesDatatype('DateTime', '2026-10-02T12:00:00.123+02:00')).toBe(true)
    expect(matchesDatatype('DateTime', '2026-10-02')).toBe(true)
    expect(matchesDatatype('Time', '12:30')).toBe(true)
    expect(matchesDatatype('Time', 'noon')).toBe(false)
  })

  it('should check numbers, integers and booleans', () => {
    expect(matchesDatatype('Number', 3.5)).toBe(true)
    expect(matchesDatatype('Number', '3.5')).toBe(true)
    expect(matchesDatatype('Number', 'three')).toBe(false)
    expect(matchesDatatype('Integer', 3)).toBe(true)
    expect(matchesDatatype('Integer', 3.5)).toBe(false)
    expect(matchesDatatype('Boolean', true)).toBe(true)
    expect(matchesDatatype('Boolean', 'https://schema.org/False')).toBe(true)
    expect(matchesDatatype('Boolean', 'yes')).toBe(false)
  })

  it('should treat other data types as text', () => {
    expect(matchesDatatype('Text', 'anything')).toBe(true)
    expect(matchesDatatype('Text', 1)).toBe(false)
    expect(matchesDatatype('CssSelectorType', '.a')).toBe(true)
  })
})
