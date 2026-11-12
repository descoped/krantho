import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../lib/fetch.js'

export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: T }

/**
 * A screen's data, read when `load` changes and again on `reload`. A new
 * `load` (another collection, another locale) shows the loading state; a
 * reload keeps the rows on screen until the new ones arrive, so nothing jumps
 * after an action.
 */
export function useLoaded<T>(
  load: () => Promise<T>,
  failure: string,
): { loaded: Loaded<T>; reload: () => void } {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(() => load)
  if (loading !== load) {
    setLoading(() => load)
    setLoaded({ state: 'loading' })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the reload trigger
  useEffect(() => {
    let active = true
    load()
      .then((data) => {
        if (active) setLoaded({ state: 'ready', data })
      })
      .catch((err: unknown) => {
        if (active) setLoaded({ state: 'error', message: errorMessage(err, failure) })
      })
    return () => {
      active = false
    }
  }, [load, failure, attempt])

  const reload = useCallback(() => {
    setLoaded((current) => (current.state === 'error' ? { state: 'loading' } : current))
    setAttempt((n) => n + 1)
  }, [])
  return { loaded, reload }
}
