import type { InvalidationMode } from '@krantho/core'

/**
 * Purges cached pages from a CDN. A purge never throws: a failed request is
 * retried once, then logged — a lost purge is bounded by the page's `s-maxage`.
 */
export interface CdnInvalidator {
  /** Purge every cached response carrying any of the tags */
  purgeTags(tags: readonly string[], mode: InvalidationMode): Promise<void>
  /** Purge cached responses by path (`/about`, `/about*`, `/*`) */
  purgePaths(paths: readonly string[], mode: InvalidationMode): Promise<void>
}
