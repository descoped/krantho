import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { Loaded } from './use-loaded.js'

/** Where focus goes once the screen has settled: on its content, or on the error that replaced it */
export interface FocusTargets {
  ready: RefObject<HTMLElement | null>
  error: RefObject<HTMLElement | null>
}

/**
 * Focus for actions that remove the control they were started from — Clear
 * selection, Show all, Try again, a bulk action's dialog. `request()` moves
 * focus once the screen is no longer loading: to the content when it is ready,
 * to the error panel when it could not load — never to the page's body.
 */
export function usePendingFocus(
  state: Loaded<unknown>['state'],
  targets: FocusTargets,
): () => void {
  const [requested, setRequested] = useState(0)
  const handled = useRef(0)
  const { ready, error } = targets

  useEffect(() => {
    if (requested === handled.current || state === 'loading') return
    handled.current = requested
    ;(state === 'error' ? error : ready).current?.focus()
  }, [requested, state, ready, error])

  return useCallback(() => setRequested((n) => n + 1), [])
}
