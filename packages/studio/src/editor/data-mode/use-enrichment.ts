import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type EnrichStep, runEnrichmentJob } from '../../lib/enrichment-job.js'
import { errorMessage } from '../../lib/fetch.js'
import { type EnrichTarget, type StepOutcome, stepOutcome } from './enrichment-model.js'

export type EnrichRun =
  | { state: 'idle' }
  | { state: 'running'; step: EnrichStep }
  | { state: 'done'; outcomes: StepOutcome[] }
  | { state: 'failed'; message: string }

/** One step for the document: start its job and wait for its answer */
async function runStep(
  step: EnrichStep,
  target: EnrichTarget,
  alive: () => boolean,
): Promise<StepOutcome | null> {
  const result = await runEnrichmentJob(step, { scope: 'item', ...target }, alive)
  if (!result) return null
  if (result.state === 'empty') return { step, state: 'skipped', text: result.message }
  return stepOutcome(step, result.status, target)
}

/**
 * Enrichment of the open document, step after step — the API runs one job at
 * a time. `onFinished` hears what the steps did, so the editor can read the
 * document and its structured data again.
 */
export function useEnrichment(
  target: EnrichTarget,
  onFinished: (outcomes: readonly StepOutcome[]) => void,
): { run: EnrichRun; start: (steps: readonly EnrichStep[]) => void } {
  const [run, setRun] = useState<EnrichRun>({ state: 'idle' })
  const mounted = useRef(true)
  // Set again on every mount: StrictMode's simulated unmount and remount must leave it true
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // The editor as it is when a run ends hears it, not as it was when the run started
  const finished = useRef(onFinished)
  useLayoutEffect(() => {
    finished.current = onFinished
  })
  // One run at a time: the API runs one job at a time
  const running = useRef(false)
  const { collection, slug } = target
  const start = useCallback(
    (steps: readonly EnrichStep[]) => {
      if (running.current) return
      running.current = true
      const alive = (): boolean => mounted.current
      void (async () => {
        const outcomes: StepOutcome[] = []
        try {
          for (const step of steps) {
            setRun({ state: 'running', step })
            const outcome = await runStep(step, { collection, slug }, alive)
            if (!outcome) return
            outcomes.push(outcome)
          }
          if (!alive()) return
          setRun({ state: 'done', outcomes })
          finished.current(outcomes)
        } catch (err: unknown) {
          if (!alive()) return
          setRun({ state: 'failed', message: errorMessage(err, 'Enrichment failed') })
          // A step that finished before the failure may have changed the document
          if (outcomes.length > 0) finished.current(outcomes)
        } finally {
          running.current = false
        }
      })()
    },
    [collection, slug],
  )
  return { run, start }
}
