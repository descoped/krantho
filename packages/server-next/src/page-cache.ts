import type { KranthoConfigInput } from '@krantho/config'
import { loadConfig } from '@krantho/config/node'

/**
 * Whether Next.js caches this app's pages: `cache.pages: 'next-isr'`, outside
 * `next dev`. The dev server renders every request, and a file edit synced by
 * the watcher arrives outside any request, where no cache tag can be
 * invalidated — so in development every read goes to the database.
 */
export function pageCacheSwitch(config: KranthoConfigInput): () => boolean {
  let enabled: boolean | undefined
  return () => {
    enabled ??=
      process.env.NODE_ENV !== 'development' &&
      loadConfig({ code: config, env: process.env }).cache.pages === 'next-isr'
    return enabled
  }
}
