import { AsyncLocalStorage } from 'node:async_hooks'
import type { ContentChange, PageCollection } from '@krantho/core'
import { documentPath, invalidationsFor, pageCollection } from '@krantho/core'
import { revalidateTag } from 'next/cache.js'
import { after } from 'next/server.js'

/** The API request a change was made in */
interface RequestScope {
  origin: string
  /** False once the response is ready: a background job's changes only invalidate */
  open: boolean
  /** Paths of the documents published in this request, rendered again after it */
  rerender: Set<string>
}

const scopes = new AsyncLocalStorage<RequestScope>()

/**
 * Handle an API request, then render again the pages its writes published, so
 * neither the editor nor the next visitor waits for the render. Next.js applies
 * the request's invalidations before `after()` callbacks run.
 */
export async function withPageRefresh(
  request: Request,
  handle: () => Promise<Response>,
): Promise<Response> {
  // The origin the request reached: the public host on Vercel, the server itself
  // behind a proxy — either way, the one whose cache holds the page
  const scope: RequestScope = {
    origin: new URL(request.url).origin,
    open: true,
    rerender: new Set(),
  }
  try {
    return await scopes.run(scope, handle)
  } finally {
    scope.open = false
    if (scope.rerender.size > 0) {
      const paths = [...scope.rerender]
      after(() => renderPages(scope.origin, paths))
    }
  }
}

/**
 * Invalidate the Next.js cache for a change: the edited document expires, so
 * its page is fresh on the next request; broad tags go stale, so their pages
 * are served once more while they render again in the background. A published
 * document's page — at `documentPath()`, from its collection's declared path —
 * is rendered again after the request; a document without a page is not.
 */
export function invalidatePages(
  change: ContentChange,
  collections: Readonly<Record<string, PageCollection>>,
): void {
  for (const { tags, mode } of invalidationsFor(change)) {
    for (const tag of tags) revalidateTag(tag, mode === 'expire' ? { expire: 0 } : 'max')
  }
  const scope = scopes.getStore()
  if (change.kind !== 'document' || !change.live || !scope?.open) return
  const collection = pageCollection(collections, change.collection)
  const path = documentPath(collection, change.slug)
  if (path) scope.rerender.add(path)
}

async function renderPages(origin: string, paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map(async (path) => {
      try {
        // Read the whole body: the page is stored once its render completes
        await (await fetch(new URL(path, origin))).arrayBuffer()
      } catch (err) {
        console.warn(`[krantho] rendering ${path} after a publish failed:`, err)
      }
    }),
  )
}
