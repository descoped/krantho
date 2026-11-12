import { useCallback, useEffect, useState } from 'react'
import { useCapabilities } from '../lib/capabilities.js'
import { errorMessage } from '../lib/fetch.js'
import { loadPulse, type PulseData } from './pulse-sources.js'

export type PulseState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: PulseData }

/** Pulse's sources, read when the screen opens and again on `reload` */
export function usePulse(): { pulse: PulseState; reload: () => void } {
  const caps = useCapabilities()
  const [pulse, setPulse] = useState<PulseState>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the reload trigger
  useEffect(() => {
    let active = true
    setPulse({ state: 'loading' })
    loadPulse(caps)
      .then((data) => {
        if (active) setPulse({ state: 'ready', data })
      })
      .catch((err: unknown) => {
        if (active) setPulse({ state: 'error', message: errorMessage(err, 'Pulse could not load') })
      })
    return () => {
      active = false
    }
  }, [caps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { pulse, reload }
}
