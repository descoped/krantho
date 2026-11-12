import { fetchEnrichmentStatus, triggerEnrichment } from './api-seo.js'
import type { EnrichStatusResponse } from './api-types.js'

/**
 * Enrichment as the API runs it (`POST /api/seo/enrich`): one background job
 * at a time, over the documents of a scope, polled at
 * `GET /api/seo/enrich/status` until it stops. It fills what is missing and
 * never overwrites a value someone set — unless the run is forced: Setup's
 * Force regenerate, the one path that overwrites.
 */

/** A step of enrichment: the meta description, then the Schema.org properties */
export type EnrichStep = 'meta-descriptions' | 'archetype'

export const STEP_LABELS: Readonly<Record<EnrichStep, string>> = {
  'meta-descriptions': 'Meta description',
  archetype: 'Schema.org properties',
}

/** The documents a job enriches: the whole site, one collection, or one document */
export type EnrichScope =
  | { scope: 'all' }
  | { scope: 'collection'; collection: string }
  | { scope: 'item'; collection: string; slug: string }

/** What a job came to: nothing to enrich (the API's reason), or its final status */
export type JobResult =
  | { state: 'empty'; message: string }
  | { state: 'finished'; status: EnrichStatusResponse }

/** How often a running job is asked about */
const POLL_INTERVAL_MS = 500

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Ask about a job until it stops running, while the screen still wants the answer */
async function finished(
  jobId: string,
  alive: () => boolean,
  onTick: (status: EnrichStatusResponse) => void,
): Promise<EnrichStatusResponse | null> {
  for (;;) {
    const status = await fetchEnrichmentStatus(jobId)
    if (!alive()) return null
    onTick(status)
    if (status.status !== 'running') return status
    await wait(POLL_INTERVAL_MS)
  }
}

/**
 * Run one step over a scope and wait for it: null when the screen stopped
 * wanting the answer. `onTick` hears each status while the job runs; `force`
 * writes over values that are set, the editors' own included.
 */
export async function runEnrichmentJob(
  step: EnrichStep,
  target: EnrichScope,
  alive: () => boolean,
  onTick: (status: EnrichStatusResponse) => void = () => undefined,
  force = false,
): Promise<JobResult | null> {
  const started = await triggerEnrichment({ type: step, force, ...target })
  if (!started.jobId) return { state: 'empty', message: started.message ?? 'Nothing to enrich' }
  const status = await finished(started.jobId, alive, onTick)
  return status ? { state: 'finished', status } : null
}
