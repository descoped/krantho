import type { DefaultProvenance } from '@krantho/persistence'
import { describe, expect, it } from 'vitest'
import { applyMetadataDefaults, retainDefaultProvenance } from '../src/metadata-defaults.js'

const provenance = (values: Record<string, unknown>): DefaultProvenance => ({
  collection: 'globals',
  slug: 'defaults',
  locale: 'en',
  version: 1,
  paths: Object.keys(values),
  values,
})

describe('materialized metadata defaults', () => {
  it('preserves explicit empty and false values, filling only absence', () => {
    const current = { sharing: { title: '', description: null, index: false, count: 0 } }
    const result = applyMetadataDefaults(
      current,
      {
        sharing: {
          title: 'Default',
          description: 'Description',
          index: true,
          count: 5,
          nested: { label: 'Label' },
        },
      },
      ['sharing'],
    )
    expect(result.metadata).toEqual({ sharing: { ...current.sharing, nested: { label: 'Label' } } })
    expect(current).toEqual({ sharing: { title: '', description: null, index: false, count: 0 } })
    expect(result.paths).toEqual(['/metadata/sharing/nested/label'])
  })

  it('reapplication updates prior defaults while keeping authored overrides', () => {
    const prior = provenance({
      '/metadata/sharing/title': 'Default',
      '/metadata/sharing/description': 'Old',
    })
    const result = applyMetadataDefaults(
      { sharing: { title: 'Authored', description: 'Old' } },
      { sharing: { title: 'New default', description: 'New' } },
      ['sharing'],
      [prior],
    )
    expect(result.metadata.sharing).toEqual({ title: 'Authored', description: 'New' })
    expect(result.paths).toEqual(['/metadata/sharing/description'])
  })

  it('records an explicitly materialized empty group and retains it', () => {
    const result = applyMetadataDefaults({}, { sharing: {} }, ['sharing'])
    expect(result.paths).toEqual(['/metadata/sharing'])
    expect(retainDefaultProvenance([provenance(result.values)], result.metadata)).toHaveLength(1)
  })

  it('drops provenance when the author clears or replaces the inherited value', () => {
    const source = provenance({ '/metadata/sharing/title': 'Default' })
    expect(retainDefaultProvenance([source], { sharing: { title: '' } })).toEqual([])
    expect(retainDefaultProvenance([source], {})).toEqual([])
  })
  it('retains dictionary keys containing dots, slashes and tildes without ambiguous paths', () => {
    const source = { sharing: { 'a.b': { 'a/b~c': 'Value' } } }
    const copied = applyMetadataDefaults({}, source, ['sharing'])
    expect(copied.paths).toEqual(['/metadata/sharing/a.b/a~1b~0c'])
    expect(retainDefaultProvenance([provenance(copied.values)], copied.metadata)).toHaveLength(1)
  })
})
