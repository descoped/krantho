import type { CacheSection } from '@krantho/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdnInvalidator } from '../src/cdn/index.js'

/**
 * Vercel purges by tag through `@vercel/functions`: an edited document is
 * deleted so the next request renders it, a broad change is marked stale.
 */

const vercel = vi.hoisted(() => ({
  invalidateByTag: vi.fn(async (_tags: string | string[]) => {}),
  dangerouslyDeleteByTag: vi.fn(
    async (_tags: string | string[], _options?: { revalidationDeadlineSeconds?: number }) => {},
  ),
}))

vi.mock('@vercel/functions', () => vercel)

const cache: CacheSection = {
  pages: 'cdn',
  cdn: {
    provider: 'vercel',
    sMaxAgeSec: 86400,
    staleWhileRevalidateSec: 604800,
    tagHeader: 'x-krantho-cache-tag',
    cloudfront: {},
    gcp: {},
  },
  shared: 'none',
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('Vercel CDN invalidator', () => {
  it('is created for the vercel provider, and none for provider none', () => {
    expect(createCdnInvalidator(cache)).not.toBeNull()
    expect(createCdnInvalidator({ ...cache, cdn: { ...cache.cdn, provider: 'none' } })).toBeNull()
  })

  it('deletes tags with no revalidation deadline on expire', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags(['k:site', 'k:d:pages:about'], 'expire')

    expect(vercel.dangerouslyDeleteByTag).toHaveBeenCalledTimes(1)
    expect(vercel.dangerouslyDeleteByTag).toHaveBeenCalledWith(['k:site', 'k:d:pages:about'], {
      revalidationDeadlineSeconds: 0,
    })
    expect(vercel.invalidateByTag).not.toHaveBeenCalled()
  })

  it('marks tags stale on stale', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags(['k:c:pages'], 'stale')

    expect(vercel.invalidateByTag).toHaveBeenCalledTimes(1)
    expect(vercel.invalidateByTag).toHaveBeenCalledWith(['k:c:pages'])
    expect(vercel.dangerouslyDeleteByTag).not.toHaveBeenCalled()
  })

  it('sends nothing for no tags', async () => {
    await createCdnInvalidator(cache)?.purgeTags([], 'expire')
    expect(vercel.dangerouslyDeleteByTag).not.toHaveBeenCalled()
  })

  it('retries a failed purge once, then logs without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vercel.invalidateByTag.mockRejectedValue(new Error('purge down'))

    await expect(
      createCdnInvalidator(cache)?.purgeTags(['k:site'], 'stale'),
    ).resolves.toBeUndefined()
    expect(vercel.invalidateByTag).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
    vercel.invalidateByTag.mockReset()
  })

  it('succeeds on the retry without logging', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vercel.invalidateByTag.mockRejectedValueOnce(new Error('blip'))

    await createCdnInvalidator(cache)?.purgeTags(['k:site'], 'stale')
    expect(vercel.invalidateByTag).toHaveBeenCalledTimes(2)
    expect(error).not.toHaveBeenCalled()
  })

  it('ignores path purges, warning once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidator = createCdnInvalidator(cache)

    await invalidator?.purgePaths(['/about'], 'expire')
    await invalidator?.purgePaths(['/*'], 'stale')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(vercel.invalidateByTag).not.toHaveBeenCalled()
    expect(vercel.dangerouslyDeleteByTag).not.toHaveBeenCalled()
  })
})
