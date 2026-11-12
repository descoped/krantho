import type { ContentChange, ContentChangeListener, IContentEngine } from '@krantho/core'
import type { ApiContext } from './types.js'

/**
 * Deliver committed writes' changes: clear the content engine's cache once, so
 * no later read in this process sees data from before the writes, then run
 * every listener for each change, awaited. A failing listener is logged and
 * never fails the write.
 */
export async function deliverChanges(
  engine: IContentEngine,
  listeners: readonly ContentChangeListener[] | undefined,
  changes: readonly ContentChange[],
): Promise<void> {
  if (changes.length === 0) return
  engine.clearCache()
  for (const change of changes) {
    for (const listener of listeners ?? []) {
      try {
        await listener(change)
      } catch (err) {
        console.warn('[krantho] content change listener failed:', err)
      }
    }
  }
}

/** Deliver one committed write's change (see {@link deliverChanges}) */
export function deliverChange(
  engine: IContentEngine,
  listeners: readonly ContentChangeListener[] | undefined,
  change: ContentChange,
): Promise<void> {
  return deliverChanges(engine, listeners, [change])
}

/** Announce committed writes from a handler, inside the request that made them */
export function announceChanges(ctx: ApiContext, changes: readonly ContentChange[]): Promise<void> {
  return deliverChanges(ctx.engine, ctx.changeListeners, changes)
}

/** Announce one committed write from a handler, inside the request that made it */
export function announceChange(ctx: ApiContext, change: ContentChange): Promise<void> {
  return announceChanges(ctx, [change])
}
