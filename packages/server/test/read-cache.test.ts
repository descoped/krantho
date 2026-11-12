import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadCache } from '../src/read-cache.js'

describe('createReadCache', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves a read from the cache until its time-to-live passes', async () => {
    vi.useFakeTimers()
    const cache = createReadCache({ enabled: true, ttlMs: 1000, maxEntries: 10 })
    const load = vi.fn(async () => 'value')

    await cache.read('a', load)
    await cache.read('a', load)
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    await cache.read('a', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads every read when disabled', async () => {
    const cache = createReadCache({ enabled: false, ttlMs: 1000, maxEntries: 10 })
    const load = vi.fn(async () => 'value')

    await cache.read('a', load)
    await cache.read('a', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares one load between concurrent reads of a key', async () => {
    const cache = createReadCache({ enabled: true, ttlMs: 1000, maxEntries: 10 })
    const load = vi.fn(async () => 'value')

    await Promise.all([cache.read('a', load), cache.read('a', load)])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not keep a failed load', async () => {
    const cache = createReadCache({ enabled: true, ttlMs: 1000, maxEntries: 10 })

    await expect(cache.read('a', async () => Promise.reject(new Error('down')))).rejects.toThrow(
      'down',
    )
    expect(await cache.read('a', async () => 'recovered')).toBe('recovered')
  })

  it('drops the oldest entry beyond the maximum', async () => {
    const cache = createReadCache({ enabled: true, ttlMs: 1000, maxEntries: 2 })
    const load = vi.fn(async () => 'value')

    await cache.read('a', load)
    await cache.read('b', load)
    await cache.read('c', load)
    await cache.read('a', load)
    expect(load).toHaveBeenCalledTimes(4)
  })
})
