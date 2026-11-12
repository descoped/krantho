import { type ReactElement, useId } from 'react'
import type { LlmProvider } from '../hooks/use-llm-provider.js'
import type { CollectionInfo } from '../lib/api.js'
import type { EnrichStatusResponse } from '../lib/api-types.js'
import { type EnrichScope, STEP_LABELS } from '../lib/enrichment-job.js'
import { collectionLabel } from '../lib/format.js'
import { type FillRun, type StepReport, stepPosition } from './fill-job.js'
import './fill-run-view.css'

/**
 * How an enrichment run over the site reads, wherever it was started: the
 * scope it takes, a status line said as it changes, and what each step did.
 * Structure's Fill what's missing and Setup's Run across the site share it.
 */

/** The scope picker's value for the whole site */
const SITE = ''

/** The scope a picker value names */
export function scopeOf(value: string): EnrichScope {
  return value === SITE ? { scope: 'all' } : { scope: 'collection', collection: value }
}

export interface ScopePickerProps {
  /** The collections whose documents render as pages: the scopes a run can take */
  collections: readonly CollectionInfo[]
  value: EnrichScope
  disabled: boolean
  onChange: (scope: EnrichScope) => void
}

/** The whole site, or one collection's pages */
export function ScopePicker({
  collections,
  value,
  disabled,
  onChange,
}: ScopePickerProps): ReactElement {
  const id = useId()
  return (
    <div className="fill-run-field">
      <label htmlFor={id}>Scope</label>
      <select
        id={id}
        className="fill-run-select"
        value={value.scope === 'all' ? SITE : value.collection}
        disabled={disabled}
        onChange={(event) => onChange(scopeOf(event.target.value))}
      >
        <option value={SITE}>The whole site</option>
        {collections.map((collection) => (
          <option key={collection.name} value={collection.name}>
            {collectionLabel(collection.name)} only
          </option>
        ))}
      </select>
    </div>
  )
}

/** Why a run cannot start now — the API runs enrichment for admins, on a set-up model — or null */
export function fillBlocker(admin: boolean, provider: LlmProvider): string | null {
  if (!admin) return 'Enrichment is run by an admin.'
  if (provider === 'loading') return 'Reading the AI provider…'
  if (provider === 'missing') return 'No language model is set up.'
  return null
}

/** What a step did, counted from the job's own items */
function reportLine(report: StepReport): string {
  if (report.empty !== null) return report.empty
  const items = report.status?.items ?? []
  const count = (state: string): number => items.filter((item) => item.status === state).length
  const errors = count('error')
  return `${count('complete')} filled, ${count('skipped')} already set or skipped${errors > 0 ? `, ${errors} failed` : ''}`
}

/** What a step used: the tokens the provider reported and the model that served it; empty when it reported neither */
export function usageLine(status: EnrichStatusResponse | null): string {
  const usage = status?.usage
  if (!usage) return ''
  const tokens =
    usage.inputTokens + usage.outputTokens > 0
      ? `${usage.inputTokens.toLocaleString('en')} tokens in, ${usage.outputTokens.toLocaleString('en')} out`
      : ''
  return [tokens, usage.model ?? ''].filter(Boolean).join(' · ')
}

/** The run in words: said by the status region as it changes */
export function runText(run: FillRun): string {
  switch (run.state) {
    case 'running': {
      const position = stepPosition(run.plan, run.step)
      const step = `${position.charAt(0).toUpperCase()}${position.slice(1)}, ${STEP_LABELS[run.step]}`
      const progress = run.status?.progress
      if (!progress) return `${step}: starting…`
      const handled = progress.completed + progress.skipped + progress.errors
      const now = progress.current ? `, now ${progress.current}` : ''
      return `${step}: ${handled} of ${progress.total} documents${now}…`
    }
    case 'done':
      return `Finished. ${run.reports.map((r) => `${STEP_LABELS[r.step]}: ${reportLine(r)}`).join('. ')}.`
    case 'failed':
      return `Enrichment failed: ${run.message}`
    default:
      return ''
  }
}

function Reports({ reports }: { reports: readonly StepReport[] }): ReactElement {
  return (
    <ul className="fill-run-reports">
      {reports.map((report) => (
        <li key={report.step}>
          <strong>{STEP_LABELS[report.step]}</strong> · {reportLine(report)}
          {usageLine(report.status) !== '' && (
            <span className="fill-run-usage"> · {usageLine(report.status)}</span>
          )}
          {(report.status?.items.length ?? 0) > 0 && (
            <details className="fill-run-disclosure">
              <summary>Each document</summary>
              <ul className="fill-run-items">
                {report.status?.items.map((item) => (
                  <li key={`${item.collection}/${item.slug}`}>
                    <code>
                      {item.collection}/{item.slug}
                    </code>{' '}
                    · {item.status}
                    {item.result || item.error ? ` · ${item.result ?? item.error}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The run's status line, said as it changes, and the steps it has finished */
export function FillRunStatus({ run }: { run: FillRun }): ReactElement {
  const reports = run.state === 'running' ? run.done : run.state === 'idle' ? [] : run.reports
  return (
    <>
      <p className="fill-run-note" role="status">
        {runText(run)}
      </p>
      {reports.length > 0 && <Reports reports={reports} />}
    </>
  )
}
