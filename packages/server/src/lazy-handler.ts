import type { KranthoHandler, KranthoHandlerOptions } from './handler.js'
import { createKranthoHandler } from './handler.js'

/**
 * Create a lazy-initialized handler singleton. First call creates, subsequent
 * calls return cached. A failed creation is not cached — the next call retries.
 */
export function createLazyHandler(options: KranthoHandlerOptions): () => Promise<KranthoHandler> {
  let promise: Promise<KranthoHandler> | null = null
  return () => {
    promise ??= createKranthoHandler(options).catch((err: unknown) => {
      promise = null
      throw err
    })
    return promise
  }
}
