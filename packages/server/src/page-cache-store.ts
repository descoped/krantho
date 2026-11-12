import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ContentSection, PersistenceSection, SiteSection } from '@krantho/config'
import { DEFAULTS } from '@krantho/config'
import type { IPageCacheStore } from '@krantho/persistence'
import { createLockAdapters } from './lock-adapters.js'
import { createAdapter } from './persistence.js'

/**
 * The site's default locale the adapter is opened with. The page cache reads no
 * content and runs without the site's configuration, so it has no locale to
 * give: an empty one matches no document, where a guessed locale would read
 * some other language's content.
 */
const NO_CONTENT_SITE: Pick<SiteSection, 'defaultLocale'> = { defaultLocale: '' }

/**
 * Content status defaults the adapter is opened with. The page cache reads no
 * content, so the values only satisfy the adapter's options.
 */
function contentDefaults(): Pick<ContentSection, 'defaultStatus'> {
  const status = DEFAULTS.content?.defaultStatus
  if (status?.filesystem === undefined) {
    throw new Error('The configuration defaults name no content.defaultStatus')
  }
  return { defaultStatus: { filesystem: status.filesystem } }
}

/**
 * Open the shared page cache store of a site's database.
 *
 * Opens the database as the server does — the adapter runs the migrations —
 * and returns its page cache store. Throws when the backend keeps no page
 * cache: the filesystem provider has no database to share between instances.
 */
export async function openPageCacheStore(
  persistence: PersistenceSection,
): Promise<IPageCacheStore> {
  if (persistence.provider === 'filesystem') {
    throw new Error(
      'The shared page cache needs a database, but persistence.provider is "filesystem". ' +
        'Use sqlite or postgres, or set cache.shared to "none".',
    )
  }
  if (persistence.provider === 'sqlite') {
    await mkdir(dirname(persistence.sqlite.path), { recursive: true })
  }
  const { lockDb } = await createAdapter(persistence, NO_CONTENT_SITE, contentDefaults(), new Map())
  const { pageCacheStore } = await createLockAdapters(lockDb, persistence.provider)
  if (!pageCacheStore) {
    throw new Error(
      `The ${persistence.provider} persistence backend could not open the shared page cache store.`,
    )
  }
  return pageCacheStore
}
