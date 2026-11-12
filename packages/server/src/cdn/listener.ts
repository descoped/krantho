import type { CacheSection } from '@krantho/config'
import type { CacheInvalidation, ContentChangeListener, InvalidationMode } from '@krantho/core'
import { invalidationsFor } from '@krantho/core'
import type { CdnInvalidator } from './types.js'

/**
 * The change listener that purges a CDN in front of the site, or null when
 * nothing needs purging: `pages: 'cdn'` purges by tag, `pages: 'next-isr'`
 * purges every path. Next.js on Vercel needs no listener — `revalidateTag`
 * already purges Vercel's edge.
 *
 * A purge runs in the background: the listener returns at once, hands the
 * purge to `waitUntil` when the host gives one, and never fails the write.
 */
export function cdnChangeListener(
  cache: CacheSection,
  invalidator: CdnInvalidator,
  waitUntil?: ((work: Promise<unknown>) => void) | undefined,
): ContentChangeListener | null {
  const purge = purgeFor(cache, invalidator)
  if (!purge) return null
  return (change) => {
    const invalidations = invalidationsFor(change)
    if (invalidations.length === 0) return
    const work = Promise.resolve()
      .then(() => purge(invalidations))
      .catch((error: unknown) => console.error('[cdn] purge failed:', error))
    try {
      waitUntil?.(work)
    } catch (error) {
      console.error('[cdn] waitUntil rejected the purge:', error)
    }
  }
}

type Purge = (invalidations: readonly CacheInvalidation[]) => Promise<void>

function purgeFor(cache: CacheSection, invalidator: CdnInvalidator): Purge | null {
  if (cache.pages === 'cdn') return (invalidations) => purgeTags(invalidator, invalidations)
  if (cache.pages === 'next-isr' && cache.cdn.provider !== 'vercel') {
    // Every live change purges every path: a published document also shows on
    // list pages whose paths krantho cannot know, and a per-path purge would
    // leave them stale until `s-maxage`. The CDN's origin is Next's warm ISR
    // cache, so a full purge costs only cheap origin hits.
    return (invalidations) => {
      const mode = invalidations.some((i) => i.mode === 'expire') ? 'expire' : 'stale'
      return invalidator.purgePaths(['/*'], mode)
    }
  }
  return null
}

/** One tag purge per mode */
async function purgeTags(
  invalidator: CdnInvalidator,
  invalidations: readonly CacheInvalidation[],
): Promise<void> {
  const byMode = new Map<InvalidationMode, string[]>()
  for (const { tags, mode } of invalidations) {
    byMode.set(mode, [...(byMode.get(mode) ?? []), ...tags])
  }
  await Promise.all([...byMode].map(([mode, tags]) => invalidator.purgeTags(tags, mode)))
}
