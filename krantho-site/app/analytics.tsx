'use client'

import { init } from '@plausible-analytics/tracker'
import { useEffect } from 'react'

// First-party endpoint (app/k/e/route.ts) that forwards events to Plausible. The
// path avoids the words filter lists match on any domain — plausible, analytics,
// stats, track, event, collect — so ad blockers have nothing to recognise.
const ANALYTICS_ENDPOINT = '/k/e'

let started = false

/**
 * Plausible pageview tracking. Starts only on the production host, so preview
 * deployments and local development are not counted.
 */
export function Analytics({ domain }: { domain: string }): null {
  useEffect(() => {
    // init() throws when called twice, and effects run twice in development
    if (started || window.location.hostname !== domain) return
    started = true
    init({ domain, endpoint: ANALYTICS_ENDPOINT })
  }, [domain])

  return null
}
