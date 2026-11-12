import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  CacheHandler,
  CacheHandlerContext,
  IncrementalCache as IncrementalCacheType,
} from 'next/dist/server/lib/incremental-cache'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key.js'
import type ResponseCacheType from 'next/dist/server/response-cache'
import type {
  CachedFetchValue,
  CachedImageValue,
  CachedRouteValue,
  GetIncrementalFetchCacheContext,
  GetIncrementalResponseCacheContext,
  IncrementalCachedAppPageValue,
  IncrementalCachedPageValue,
  IncrementalCacheValue,
  ResponseGenerator,
} from 'next/dist/server/response-cache/types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The shared cache handler, run as two Next.js instances on one SQLite
 * database: each instance is a fresh copy of the handler module with its own
 * database connection. Stale-while-revalidate is checked through Next's own
 * IncrementalCache and ResponseCache, not only through the handler's fields.
 */

type HandlerClass = new (context: CacheHandlerContext) => CacheHandler
type IncrementalCacheClass = typeof IncrementalCacheType
type ResponseCacheClass = typeof ResponseCacheType

const YEAR_SECONDS = 31536000

const context: CacheHandlerContext = { revalidatedTags: [], _requestHeaders: {} }
const envKeys = ['KRANTHO_PATHS_DATA_DIR', 'KRANTHO_PERSISTENCE_PROVIDER'] as const
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

let dataDir: string
let HandlerA: HandlerClass
let HandlerB: HandlerClass
let IncrementalCache: IncrementalCacheClass
let ResponseCache: ResponseCacheClass

/** A fresh copy of the handler module: a separate process's store and connection */
async function loadHandler(): Promise<HandlerClass> {
  vi.resetModules()
  const module = (await import('../src/cache-handler.js')) as { default: HandlerClass }
  return module.default
}

/** A Next IncrementalCache in production mode, over the given handler */
function nextCache(Handler: HandlerClass): IncrementalCacheType {
  const preview = { previewModeId: 'test', previewModeSigningKey: '', previewModeEncryptionKey: '' }
  return new IncrementalCache({
    dev: false,
    requestHeaders: {},
    CurCacheHandler: Handler as unknown as typeof CacheHandler,
    previewProps: preview,
    prerenderManifest: { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview },
  })
}

/** A rendered App Router page; `route` names its document and implicit path tags */
function appPage(html: string, route: string): IncrementalCachedAppPageValue {
  return {
    kind: 'APP_PAGE' as IncrementalCachedAppPageValue['kind'],
    html,
    rscData: Buffer.from([0, 1, 2, 250, 255]),
    headers: {
      'x-next-cache-tags': `k:d:pages:${route},_N_T_/layout,_N_T_/${route}`,
      'content-type': 'text/html',
    },
    postponed: undefined,
    status: 200,
    segmentData: new Map([
      ['/_tree', Buffer.from('tree')],
      ['/about/__PAGE__', Buffer.from([9, 8, 7])],
    ]),
  }
}

function fetchValue(body: string): CachedFetchValue {
  return {
    kind: 'FETCH' as CachedFetchValue['kind'],
    data: { headers: {}, body, url: '' },
    revalidate: YEAR_SECONDS,
  }
}

const fetchGet = (tags: string[], softTags: string[] = []): GetIncrementalFetchCacheContext => ({
  kind: 'FETCH' as GetIncrementalFetchCacheContext['kind'],
  tags,
  softTags,
})

/** Next's get context for a rendered page, route or image */
function responseGet(
  kind: 'APP_PAGE' | 'APP_ROUTE' | 'PAGES' | 'IMAGE',
): GetIncrementalResponseCacheContext {
  return {
    kind: kind as GetIncrementalResponseCacheContext['kind'],
    isFallback: false,
    route: { kind, sourceRoute: '/[slug]/page' } as GetIncrementalResponseCacheContext['route'],
  }
}

const pageGet = responseGet('APP_PAGE')

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'krantho-cache-handler-'))
  process.env.KRANTHO_PATHS_DATA_DIR = dataDir
  process.env.KRANTHO_PERSISTENCE_PROVIDER = 'sqlite'
  HandlerA = await loadHandler()
  HandlerB = await loadHandler()
  ;({ IncrementalCache } = await import('next/dist/server/lib/incremental-cache/index.js'))
  const responseCache = (await import('next/dist/server/response-cache/index.js')) as {
    default: ResponseCacheClass | { default: ResponseCacheClass }
  }
  ResponseCache =
    'default' in responseCache.default ? responseCache.default.default : responseCache.default
})

afterAll(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  rmSync(dataDir, { recursive: true, force: true })
})

/** Next 16.3 keys a response cache by the route that owns it */
const PAGE_OWNER = { kind: 'APP_PAGE', sourceRoute: '/[slug]/page' } as ConstructorParameters<
  typeof ResponseCache
>[0]['route']

/** The key Next stores a page under, which a handler sees as opaque */
const pageKey = (pathname: string): string => getRouteCacheKey(pathname, PAGE_OWNER)

describe('shared cache handler — two instances on one store', () => {
  it('opens the database under the data directory from the environment', async () => {
    await new HandlerA(context).set('/opens', fetchValue('x'), { fetchCache: true, tags: [] })
    expect(existsSync(join(dataDir, 'content.db'))).toBe(true)
  })

  it('serves on B what A wrote', async () => {
    const a = new HandlerA(context)
    const b = new HandlerB(context)
    await a.set('fetch-hit', fetchValue('from A'), { fetchCache: true, tags: ['k:site'] })

    const hit = await b.get('fetch-hit', fetchGet(['k:site']))
    expect(hit?.value).toEqual(fetchValue('from A'))
    expect(hit?.lastModified).toBeGreaterThan(0)
    expect(Number.isInteger(hit?.lastModified)).toBe(true)
  })

  it('expire 0 on A → B returns null', async () => {
    const a = new HandlerA(context)
    const b = new HandlerB(context)
    await a.set('fetch-expire', fetchValue('doc'), {
      fetchCache: true,
      tags: ['k:site', 'k:d:pages:expire'],
    })
    await a.revalidateTag('k:d:pages:expire', { expire: 0 })

    expect(await b.get('fetch-expire', fetchGet(['k:site', 'k:d:pages:expire']))).toBeNull()
  })

  it('no durations expires, as Next does without a profile', async () => {
    const a = new HandlerA(context)
    await a.set('fetch-bare', fetchValue('doc'), { fetchCache: true, tags: ['k:d:pages:bare'] })
    await a.revalidateTag(['k:d:pages:bare'])

    expect(await new HandlerB(context).get('fetch-bare', fetchGet(['k:d:pages:bare']))).toBeNull()
  })

  it('an implicit tag passed only on get (softTags) expires a fetch entry', async () => {
    const a = new HandlerA(context)
    await a.set('fetch-soft', fetchValue('doc'), { fetchCache: true, tags: ['k:site'] })
    await a.revalidateTag('_N_T_/soft', { expire: 0 })

    const b = new HandlerB(context)
    expect(await b.get('fetch-soft', fetchGet(['k:site']))).not.toBeNull()
    expect(await b.get('fetch-soft', fetchGet(['k:site'], ['_N_T_/soft']))).toBeNull()
  })

  it("'max' on A → B serves the fetch entry as stale (lastModified -1), and Next re-fetches", async () => {
    const a = new HandlerA(context)
    await a.set('fetch-max', fetchValue('old'), { fetchCache: true, tags: ['k:d:pages:max'] })
    await a.revalidateTag('k:d:pages:max', { expire: YEAR_SECONDS })

    const raw = await new HandlerB(context).get('fetch-max', fetchGet(['k:d:pages:max']))
    expect(raw?.lastModified).toBe(-1)
    expect(raw?.value).toEqual(fetchValue('old'))

    // Next's IncrementalCache on B reads it as stale: unstable_cache serves it and refreshes in the background
    const entry = await nextCache(HandlerB).get('fetch-max', fetchGet(['k:d:pages:max']))
    expect(entry?.isStale).toBe(true)
    expect(entry?.value.data.body).toBe('old')
  })

  it('a later write on B after the stale mark is fresh again', async () => {
    const a = new HandlerA(context)
    const b = new HandlerB(context)
    await a.set('fetch-refresh', fetchValue('old'), { fetchCache: true, tags: ['k:d:pages:r'] })
    await a.revalidateTag('k:d:pages:r', { expire: YEAR_SECONDS })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await b.set('fetch-refresh', fetchValue('new'), { fetchCache: true, tags: ['k:d:pages:r'] })

    const entry = await nextCache(HandlerA).get('fetch-refresh', fetchGet(['k:d:pages:r']))
    expect(entry?.isStale).toBe(false)
    expect(entry?.value.data.body).toBe('new')
  })
})

describe('shared cache handler — pages', () => {
  it('reads page tags from x-next-cache-tags: expire 0 → null on B', async () => {
    const a = new HandlerA(context)
    await a.set('/about-expire', appPage('<p>about</p>', 'about-expire'), {})
    expect(await new HandlerB(context).get('/about-expire', pageGet)).not.toBeNull()

    await a.revalidateTag('_N_T_/about-expire', { expire: 0 })
    expect(await new HandlerB(context).get('/about-expire', pageGet)).toBeNull()
  })

  it('a page entry round-trips rscData as a Buffer and segmentData as a Map of Buffers', async () => {
    const page = appPage('<p>bytes</p>', 'bytes')
    await new HandlerA(context).set('/bytes', page, {})

    const hit = await new HandlerB(context).get('/bytes', pageGet)
    const value = hit?.value as IncrementalCachedAppPageValue
    expect(value).toEqual(page)
    expect(Buffer.isBuffer(value.rscData)).toBe(true)
    expect(value.segmentData).toBeInstanceOf(Map)
    for (const segment of value.segmentData?.values() ?? []) {
      expect(Buffer.isBuffer(segment)).toBe(true)
    }
  })

  it("'max' → B renders the page before it responds, since Next 16.3 serves no entry past its tags", async () => {
    const a = new HandlerA(context)
    await a.set(pageKey('/about'), appPage('<p>old</p>', 'about'), {})
    await a.revalidateTag('k:d:pages:about', { expire: YEAR_SECONDS })

    const incremental = nextCache(HandlerB)
    const entry = await incremental.get('/about', pageGet)
    expect(entry?.isStale).toBe(-1)

    const renders: Parameters<ResponseGenerator>[0][] = []
    const served = await new ResponseCache({ minimalMode: false, route: PAGE_OWNER }).get(
      '/about',
      async (state) => {
        renders.push(state)
        return null
      },
      {
        routeKind: 'APP_PAGE' as Parameters<ResponseCacheType['get']>[2]['routeKind'],
        incrementalCache: incremental,
        isFallback: false,
        isRoutePPREnabled: false,
      },
    )

    // The page is rendered first: the stale entry is not the response
    expect(served).toBeNull()
    expect(renders).toHaveLength(1)
    expect(renders[0]?.hasResolved).toBe(false)
  })

  it('an expired page is rendered before the response (blocking), not served', async () => {
    const a = new HandlerA(context)
    await a.set(pageKey('/blocking'), appPage('<p>old</p>', 'blocking'), {})
    await a.revalidateTag('k:d:pages:blocking', { expire: 0 })

    const renders: Parameters<ResponseGenerator>[0][] = []
    const served = await new ResponseCache({ minimalMode: false, route: PAGE_OWNER }).get(
      '/blocking',
      async (state) => {
        renders.push(state)
        return null
      },
      {
        routeKind: 'APP_PAGE' as Parameters<ResponseCacheType['get']>[2]['routeKind'],
        incrementalCache: nextCache(HandlerB),
        isFallback: false,
        isRoutePPREnabled: false,
      },
    )
    expect(served).toBeNull()
    expect(renders).toHaveLength(1)
    expect(renders[0]?.hasResolved).toBe(false)
    expect(renders[0]?.previousCacheEntry).toBeNull()
  })
})

describe('shared cache handler — every value kind', () => {
  it('route bodies and images come back as Buffers', async () => {
    const route: CachedRouteValue = {
      kind: 'APP_ROUTE' as CachedRouteValue['kind'],
      body: Buffer.from('{"ok":true}'),
      status: 200,
      headers: { 'x-next-cache-tags': 'k:site', 'content-type': 'application/json' },
    }
    const image: CachedImageValue = {
      kind: 'IMAGE' as CachedImageValue['kind'],
      etag: 'e1',
      upstreamEtag: 'u1',
      buffer: Buffer.from([137, 80, 78, 71]),
      extension: 'png',
      revalidate: 60,
    }
    const a = new HandlerA(context)
    await a.set('/api/route', route, {})
    await a.set('image-key', image, {})

    const b = new HandlerB(context)
    const routeHit = (await b.get('/api/route', responseGet('APP_ROUTE')))
      ?.value as CachedRouteValue
    const imageHit = (await b.get('image-key', responseGet('IMAGE')))?.value as CachedImageValue
    expect(routeHit).toEqual(route)
    expect(Buffer.isBuffer(routeHit.body)).toBe(true)
    expect(imageHit).toEqual(image)
    expect(Buffer.isBuffer(imageHit.buffer)).toBe(true)

    await a.revalidateTag('k:site', { expire: 0 })
    expect(await b.get('/api/route', responseGet('APP_ROUTE'))).toBeNull()
  })

  it('pages-router values, redirects and null (not found) round-trip', async () => {
    const pages: IncrementalCachedPageValue = {
      kind: 'PAGES' as IncrementalCachedPageValue['kind'],
      html: '<p>pages</p>',
      pageData: { pageProps: { title: 'T', list: [1, 2] } },
      headers: undefined,
      status: 200,
    }
    const redirect = {
      kind: 'REDIRECT',
      props: { destination: '/x', permanent: false },
    } as unknown as IncrementalCacheValue
    const a = new HandlerA(context)
    await a.set('/pages', pages, {})
    await a.set('/redirect', redirect, {})
    await a.set('/missing', null, {})

    const b = new HandlerB(context)
    const pageGetPages = responseGet('PAGES')
    expect((await b.get('/pages', pageGetPages))?.value).toEqual({ ...pages, headers: undefined })
    expect((await b.get('/redirect', pageGetPages))?.value).toEqual(redirect)
    const missing = await b.get('/missing', pageGetPages)
    expect(missing).not.toBeNull()
    expect(missing?.value).toBeNull()
  })
})

describe('shared cache handler — loading and failures', () => {
  it('Next can resolve the subpath with require.resolve and construct its default export', async () => {
    const require = createRequire(import.meta.url)
    const resolved = require.resolve('@krantho/server-next/cache-handler')
    expect(resolved).toBe(fileURLToPath(new URL('../dist/cache-handler.js', import.meta.url)))
    const module = (await import(resolved)) as { default: HandlerClass }
    const handler = new module.default(context)
    expect(typeof handler.get).toBe('function')
    expect(typeof handler.revalidateTag).toBe('function')
  })

  it('filesystem persistence fails loudly: there is no database to share', async () => {
    process.env.KRANTHO_PERSISTENCE_PROVIDER = 'filesystem'
    try {
      const Handler = await loadHandler()
      const handler = new Handler(context)
      await expect(handler.get('/about', pageGet)).rejects.toThrow(/filesystem/)
      await expect(handler.set('/about', null, {})).rejects.toThrow(/filesystem/)
      await expect(handler.revalidateTag('k:site')).rejects.toThrow(/filesystem/)
    } finally {
      process.env.KRANTHO_PERSISTENCE_PROVIDER = 'sqlite'
    }
  })

  it('an invalid persistence environment fails loudly', async () => {
    process.env.KRANTHO_PERSISTENCE_PROVIDER = 'postgres'
    const url = process.env.KRANTHO_PERSISTENCE_POSTGRES_URL
    delete process.env.KRANTHO_PERSISTENCE_POSTGRES_URL
    try {
      const Handler = await loadHandler()
      await expect(new Handler(context).get('/about', pageGet)).rejects.toThrow(/postgres/i)
    } finally {
      process.env.KRANTHO_PERSISTENCE_PROVIDER = 'sqlite'
      if (url !== undefined) process.env.KRANTHO_PERSISTENCE_POSTGRES_URL = url
    }
  })
})
