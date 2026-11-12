import { useRef, useState } from 'react'
import { errorMessage } from '../lib/fetch.js'

/**
 * One write at a time: busy while it runs, for rendering, and a second call
 * made while it runs is ignored. A ref holds the guard, not the state: two
 * clicks in one tick both see the state before it updates.
 */
export function useSingleFlight(): {
  busy: boolean
  once: (work: () => Promise<void>) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function once(work: () => Promise<void>): Promise<void> {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await work()
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { busy, once }
}

export interface BusyAction {
  busy: boolean
  /** What stopped the action — a check, or the API's refusal — shown where it was asked for */
  error: string | null
  setError: (error: string | null) => void
  /** Run the work once at a time; a failure becomes the error, in the API's words */
  run: (work: () => Promise<void>, failure: string) => Promise<void>
}

/**
 * A dialog's action: busy while it runs, so it is not sent twice. On success
 * the dialog is closed by its caller; on failure it stays, saying why.
 */
export function useBusyAction(): BusyAction {
  const { busy, once } = useSingleFlight()
  const [error, setError] = useState<string | null>(null)
  const run = (work: () => Promise<void>, failure: string): Promise<void> =>
    once(async () => {
      setError(null)
      try {
        await work()
      } catch (err: unknown) {
        setError(errorMessage(err, failure))
      }
    })
  return { busy, error, setError, run }
}
