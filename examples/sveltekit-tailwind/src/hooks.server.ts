import type { Handle } from '@sveltejs/kit/hooks'
import { createPageCacheHandle } from '@krantho/server-sveltekit'
import config from '../krantho.config'

// Every page renders under the page cache rules: tagged CDN headers when
// `cache.pages` is 'cdn', drafts behind a signed preview link. Keep it the
// outermost handle — first in `sequence()` — so it sees every header another
// hook adds, a `Set-Cookie` above all.
export const handle: Handle = createPageCacheHandle({ config })
