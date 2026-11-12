import { useCallback, useEffect, useRef, useState } from 'react'

/** A message currently displayed by `useTimedMessage`. */
export interface TimedMessage {
  text: string
  /** `'success'` renders green, `'error'` renders red */
  kind: 'success' | 'error'
}

/**
 * Hook for managing a short-lived success/error status message with
 * automatic dismiss after a TTL.
 *
 * Success messages auto-dismiss, error messages stick until explicitly
 * cleared or replaced, and the timer is cleaned up on unmount.
 */
export function useTimedMessage(defaultTtlMs = 3000): {
  message: TimedMessage | null
  showSuccess: (text: string, ttlMs?: number) => void
  showError: (text: string) => void
  clear: () => void
} {
  const [message, setMessage] = useState<TimedMessage | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clear = useCallback(() => {
    clearTimer()
    setMessage(null)
  }, [clearTimer])

  const showSuccess = useCallback(
    (text: string, ttlMs?: number) => {
      clearTimer()
      setMessage({ text, kind: 'success' })
      const ttl = ttlMs ?? defaultTtlMs
      if (ttl > 0) {
        timerRef.current = setTimeout(() => {
          setMessage(null)
          timerRef.current = null
        }, ttl)
      }
    },
    [clearTimer, defaultTtlMs],
  )

  // Errors don't auto-dismiss — the user should explicitly clear them or
  // trigger a new action that replaces the message. Stuck error messages are
  // better than surprise-disappearing ones.
  const showError = useCallback(
    (text: string) => {
      clearTimer()
      setMessage({ text, kind: 'error' })
    },
    [clearTimer],
  )

  // Cancel the timer if the component unmounts mid-countdown.
  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [clearTimer])

  return { message, showSuccess, showError, clear }
}
