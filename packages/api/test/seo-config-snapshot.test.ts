import { describe, expect, it, vi } from 'vitest'
import { seoConfigSnapshot } from '../src/seo-config-snapshot.js'
import { testStores } from './assistant/fixtures.js'

const entities = { entities: [{ '@type': 'Article', properties: {} }] }

describe('seoConfigSnapshot', () => {
  it('answers every read from one read of the store', async () => {
    const { seo } = testStores()
    await seo.saveConfig({ id: 'site', scope: 'site', config: entities })
    await seo.saveConfig({ id: 'collection:docs', scope: 'collection', config: entities })
    await seo.saveConfig({ id: 'route:/docs/**', scope: 'route', config: entities })
    const listConfigs = vi.spyOn(seo, 'listConfigs')
    const getConfig = vi.spyOn(seo, 'getConfig')

    const snapshot = await seoConfigSnapshot(seo)

    expect((await snapshot?.getConfig('site'))?.scope).toBe('site')
    expect(await snapshot?.getConfig('doc:docs/missing')).toBeNull()
    expect((await snapshot?.listConfigs('route'))?.map((stored) => stored.id)).toEqual([
      'route:/docs/**',
    ])
    expect(await snapshot?.listConfigs()).toHaveLength(3)
    expect(listConfigs).toHaveBeenCalledTimes(1)
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('is nothing without a store', async () => {
    expect(await seoConfigSnapshot(undefined)).toBeUndefined()
  })
})
