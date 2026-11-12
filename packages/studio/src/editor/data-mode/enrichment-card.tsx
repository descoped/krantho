import { CircleCheck, CircleMinus, CircleX, Sparkles } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { useLlmProvider } from '../../hooks/use-llm-provider.js'
import { STEP_LABELS } from '../../lib/enrichment-job.js'
import { AI_SETUP_PATH } from '../../lib/paths.js'
import { useFillRun } from '../../structure/fill-job.js'
import { ActionButton } from '../action-button.js'
import { DataCard, DataNote } from './data-card.js'
import {
  type EnrichFacts,
  type EnrichTarget,
  enrichBlocker,
  type StepOutcome,
} from './enrichment-model.js'
import { type EnrichRun, useEnrichment } from './use-enrichment.js'

const OUTCOME_ICONS = { generated: CircleCheck, skipped: CircleMinus, error: CircleX } as const

function Outcomes({ outcomes }: { outcomes: readonly StepOutcome[] }): ReactElement {
  return (
    <ul className="data-outcomes">
      {outcomes.map((outcome) => {
        const Icon = OUTCOME_ICONS[outcome.state]
        return (
          <li key={outcome.step} className={`data-outcome data-outcome--${outcome.state}`}>
            <Icon aria-hidden="true" />
            <span>
              <strong>{STEP_LABELS[outcome.step]}</strong> · {outcome.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** What a screen reader hears of the run: said once as it changes, from a region always in the page */
function runAnnouncement(run: EnrichRun): string {
  switch (run.state) {
    case 'running':
      return `Enriching · ${STEP_LABELS[run.step]}…`
    case 'failed':
      return `Enrichment failed: ${run.message}`
    case 'done':
      return `Enrichment finished. ${run.outcomes.map((o) => `${STEP_LABELS[o.step]}: ${o.text}`).join('. ')}`
    default:
      return ''
  }
}

/** What the last run is doing or did, shown; the status region beside it announces it */
function RunState({ run }: { run: EnrichRun }): ReactElement {
  return (
    <>
      <p className="visually-hidden" role="status">
        {runAnnouncement(run)}
      </p>
      {run.state === 'running' && <DataNote>Enriching · {STEP_LABELS[run.step]}…</DataNote>}
      {run.state === 'failed' && <DataNote tone="error">{run.message}</DataNote>}
      {run.state === 'done' && <Outcomes outcomes={run.outcomes} />}
    </>
  )
}

export interface EnrichmentCardProps {
  target: EnrichTarget
  facts: EnrichFacts
  /** The steps finished: read the document and its structured data again */
  onFinished: (outcomes: readonly StepOutcome[]) => void
}

/** No language model is set up: where to set one up */
function SetupNote(): ReactElement {
  return (
    <DataNote>
      No language model is set up. Set one up in <Link to={AI_SETUP_PATH}>Setup › AI provider</Link>
      .
    </DataNote>
  )
}

function Actions(props: EnrichmentCardProps): ReactElement {
  const { run, start } = useEnrichment(props.target, props.onFinished)
  const siteRun = useFillRun()
  const running = run.state === 'running'
  const reason = running
    ? 'Enrichment is running.'
    : siteRun.state === 'running'
      ? 'A run across the site is going, and the API runs one job at a time. Enrich this document when it ends.'
      : enrichBlocker(props.facts)
  return (
    <>
      <div className="data-actions">
        <ActionButton
          reason={reason}
          variant="primary"
          icon={Sparkles}
          onClick={() => start(['meta-descriptions', 'archetype'])}
        >
          Enrich this document
        </ActionButton>
      </div>
      {reason && !running && <DataNote>{reason}</DataNote>}
      <RunState run={run} />
    </>
  )
}

/**
 * Enrichment, on request: it fills what is missing and never overwrites, and
 * says exactly where its results land and when the live page changes (§7)
 */
export function EnrichmentCard(props: EnrichmentCardProps): ReactElement {
  const provider = useLlmProvider()
  return (
    <DataCard
      title="Enrichment"
      lead={
        <>
          Fills what is <em>missing</em> — a meta description and the Schema.org properties no one
          has set — with the language model set up in Setup › AI provider. It never overwrites a
          value someone set. What it fills is saved to the document at once: the meta description as
          a new version and in the document's SEO settings, the Schema.org properties in those
          settings. The SEO settings have no versions, so the structured data on the live page — and
          the meta description the site reads from them first — changes straight away.
        </>
      }
    >
      {provider === 'loading' && <DataNote>Reading the AI provider…</DataNote>}
      {provider === 'missing' && <SetupNote />}
      {(provider === 'configured' || provider === 'unknown') && <Actions {...props} />}
    </DataCard>
  )
}
