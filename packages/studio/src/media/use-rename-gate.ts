import { useCallback, useEffect, useRef, useState } from 'react'
import type { References } from './media-model.js'

/** How long a rename waits for the file's references before it warns without a count */
export const REFERENCE_WAIT_MS = 5000

export type RenameGateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'confirm'; count: number | null }

/** What the references say about a rename: wait for them, save, or warn with the count (null: unknown) */
function decide(references: References | undefined): 'wait' | 'save' | { count: number | null } {
  if (!references || references.state === 'loading') return 'wait'
  if (references.state === 'failed') return { count: null }
  const count = references.documents.length
  return count === 0 ? 'save' : { count }
}

export interface RenameGate {
  state: RenameGateState
  /** A rename was asked for: save it, warn first, or wait for the references */
  request: () => void
  confirm: () => void
  cancel: () => void
}

/**
 * A rename is never saved past documents that use the file unwarned: it waits
 * for the file's references (up to REFERENCE_WAIT_MS), then saves when none use
 * it, and otherwise asks first — with the count, or saying it is unknown.
 */
export function useRenameGate(references: References | undefined, save: () => void): RenameGate {
  const [state, setState] = useState<RenameGateState>({ phase: 'idle' })
  const saveRef = useRef(save)
  saveRef.current = save
  const settle = useCallback((decision: ReturnType<typeof decide>): void => {
    if (decision === 'wait') setState({ phase: 'checking' })
    else if (decision === 'save') {
      setState({ phase: 'idle' })
      saveRef.current()
    } else setState({ phase: 'confirm', count: decision.count })
  }, [])
  const checking = state.phase === 'checking'
  useEffect(() => {
    if (!checking) return
    const decision = decide(references)
    if (decision !== 'wait') {
      settle(decision)
      return
    }
    const timer = setTimeout(() => settle({ count: null }), REFERENCE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [checking, references, settle])
  return {
    state,
    request: () => settle(decide(references)),
    confirm: () => {
      setState({ phase: 'idle' })
      saveRef.current()
    },
    cancel: () => setState({ phase: 'idle' }),
  }
}
