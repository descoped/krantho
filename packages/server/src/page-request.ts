import { AsyncLocalStorage } from 'node:async_hooks'

/** How one page request reads content */
export interface PageRequestOptions {
  /** Serve every content loader read from the current version, draft included */
  preview: boolean
}

/** What a page request rendered, and the cache tags of every read it made */
export interface PageRequestResult<T> {
  value: T
  /** Deduplicated, in first-read order */
  tags: string[]
}

/** The state of one running page request */
interface PageRequestScope {
  readonly preview: boolean
  readonly tags: Set<string>
}

const scopes = new AsyncLocalStorage<PageRequestScope>()

/**
 * Render one page inside a request scope.
 *
 * While `render` runs, every content loader read records its cache tags into
 * the scope, and with `preview: true` every read is served from the loader's
 * preview view. Each call has its own scope, so concurrent and nested renders
 * never share tags or the preview flag. Outside a scope the loader behaves as
 * it always does.
 */
export async function runPageRequest<T>(
  options: PageRequestOptions,
  render: () => Promise<T>,
): Promise<PageRequestResult<T>> {
  const scope: PageRequestScope = { preview: options.preview, tags: new Set() }
  const value = await scopes.run(scope, render)
  return { value, tags: [...scope.tags] }
}

/** Whether the active page request, if any, reads previews */
export function inPreviewRequest(): boolean {
  return scopes.getStore()?.preview ?? false
}

/** Record a read's cache tags into the active page request; no-op outside one */
export function recordReadTags(tags: readonly string[]): void {
  const scope = scopes.getStore()
  if (!scope) return
  for (const tag of tags) scope.tags.add(tag)
}
