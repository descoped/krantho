import { purgeWithRetry } from './retry.js'
import type { CdnInvalidator } from './types.js'

/**
 * Vercel purges by tag through `@vercel/functions` (an optional peer). Both
 * calls work inside a Vercel function and resolve as no-ops elsewhere.
 * `expire` deletes, so the next request renders; `stale` serves the old page
 * while it refreshes. Vercel has no path purge.
 */
export function createVercelInvalidator(): CdnInvalidator {
  let warnedPaths = false
  return {
    async purgeTags(tags, mode) {
      if (tags.length === 0) return
      await purgeWithRetry('vercel', async () => {
        const vercel = await import('@vercel/functions')
        if (mode === 'expire') {
          await vercel.dangerouslyDeleteByTag([...tags], { revalidationDeadlineSeconds: 0 })
          return
        }
        await vercel.invalidateByTag([...tags])
      })
    },
    async purgePaths() {
      if (warnedPaths) return
      warnedPaths = true
      console.warn('[cdn] vercel purges by tag only; path purges are ignored')
    },
  }
}
