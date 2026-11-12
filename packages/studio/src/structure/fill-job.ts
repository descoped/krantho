import { useSyncExternalStore } from 'react'
import type { EnrichStatusResponse } from '../lib/api-types.js'
import { type EnrichScope, type EnrichStep, runEnrichmentJob } from '../lib/enrichment-job.js'
import { errorMessage } from '../lib/fetch.js'

/**
 * Enrichment over the site or one collection, one job after the other (the API
 * runs one at a time): Structure's Fill what's missing, and Setup › AI
 * provider's Run across the site — Fill missing SEO, Meta only and Force
 * regenerate. Only Force regenerate overwrites values someone set.
 *
 * The run belongs to Studio, not to a screen: it is kept here, outside React,
 * so every step starts and finishes whether or not its dialog — or the screen
 * that started it — is still open. Screens follow it with `useFillRun`.
 */

/** What a run does: its steps, in order, and whether it writes over values that are set */
export interface FillPlan {
  steps: readonly EnrichStep[]
  force: boolean
}

/** The meta descriptions, then the Schema.org properties, filling only what is missing */
export const FILL_MISSING: FillPlan = { steps: ['meta-descriptions', 'archetype'], force: false }

/** The meta descriptions only, filling only what is missing */
export const META_ONLY: FillPlan = { steps: ['meta-descriptions'], force: false }

/** Both steps, writing over every value — the editors' own included */
export const FORCE_REGENERATE: FillPlan = { steps: FILL_MISSING.steps, force: true }

/** What one step did across its documents */
export interface StepReport {
  step: EnrichStep
  /** The API had nothing to enrich, and said why */
  empty: string | null
  status: EnrichStatusResponse | null
}

export type FillRun =
  | { state: 'idle' }
  | {
      state: 'running'
      plan: FillPlan
      step: EnrichStep
      status: EnrichStatusResponse | null
      done: StepReport[]
    }
  | { state: 'done'; plan: FillPlan; reports: StepReport[] }
  | { state: 'failed'; plan: FillPlan; message: string; reports: StepReport[] }

/** Where a step stands in its run: "step 1 of 2" */
export function stepPosition(plan: FillPlan, step: EnrichStep): string {
  return `step ${plan.steps.indexOf(step) + 1} of ${plan.steps.length}`
}

let current: FillRun = { state: 'idle' }
const listeners = new Set<() => void>()

function set(run: FillRun): void {
  current = run
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const read = (): FillRun => current

/** Run the plan's steps in order, reporting each tick; a step's job is followed to its end */
async function runSteps(target: EnrichScope, plan: FillPlan): Promise<StepReport[]> {
  const reports: StepReport[] = []
  for (const step of plan.steps) {
    const running = (status: EnrichStatusResponse | null): FillRun => ({
      state: 'running',
      plan,
      step,
      status,
      done: [...reports],
    })
    set(running(null))
    const result = await runEnrichmentJob(
      step,
      target,
      () => true,
      (status) => set(running(status)),
      plan.force,
    )
    // The run is never abandoned, so a step always comes back with its result
    if (!result) throw new Error(`${step} stopped without an answer`)
    reports.push(
      result.state === 'empty'
        ? { step, empty: result.message, status: null }
        : { step, empty: null, status: result.status },
    )
  }
  return reports
}

/**
 * Start a run unless one is running — Fill what's missing unless another plan
 * is given; `onEnd` hears how it ended, whichever screen is open then. False
 * when another run was already going, so nothing started.
 */
export function startFill(
  target: EnrichScope,
  onEnd: (run: FillRun) => void,
  plan: FillPlan = FILL_MISSING,
): boolean {
  if (current.state === 'running') return false
  void runSteps(target, plan)
    .then(
      (reports) => set({ state: 'done', plan, reports }),
      (err: unknown) => {
        const done = current.state === 'running' ? current.done : []
        const message = errorMessage(err, 'Enrichment failed')
        set({ state: 'failed', plan, message, reports: done })
      },
    )
    .finally(() => onEnd(current))
  return true
}

/** Put a finished run's outcome away, once it has been seen; a running one is kept */
export function clearFill(): void {
  if (current.state !== 'running') set({ state: 'idle' })
}

/** The run as it stands, following it as it moves */
export function useFillRun(): FillRun {
  return useSyncExternalStore(subscribe, read, read)
}
