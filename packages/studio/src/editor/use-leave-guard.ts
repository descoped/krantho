import { useCallback, useEffect, useRef } from 'react'
import { type Blocker, type BlockerFunction, type Location, useBlocker } from 'react-router'
import { MODE_PARAM } from './modes.js'

export interface LeaveGuard {
  /** Holds a navigation inside Studio while there are unsaved changes */
  blocker: Blocker
  /** Let the next navigation through */
  release: () => void
}

/** The address's search without the open mode: switching modes stays on the document */
function documentSearch(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(MODE_PARAM)
  params.sort()
  return params.toString()
}

/** Whether a navigation leaves the open document or locale — not one that only switches its mode */
export function leavesDocument(
  current: Pick<Location, 'pathname' | 'search'>,
  next: Pick<Location, 'pathname' | 'search'>,
): boolean {
  return (
    current.pathname !== next.pathname ||
    documentSearch(current.search) !== documentSearch(next.search)
  )
}

/**
 * Leaving with unsaved changes asks first: a navigation inside Studio is held
 * by the returned blocker until the person chooses, and closing or reloading
 * the tab raises the browser's own prompt. `release()` lets the next
 * navigation through — after a save that moves to the new document's address.
 */
export function useLeaveGuard(dirty: boolean): LeaveGuard {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const released = useRef(false)

  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    if (released.current || !dirtyRef.current) return false
    return leavesDocument(currentLocation, nextLocation)
  }, [])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const release = useCallback(() => {
    released.current = true
  }, [])
  return { blocker, release }
}
