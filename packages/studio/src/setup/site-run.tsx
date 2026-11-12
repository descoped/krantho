import { ListChecks, RefreshCcw, Sparkles } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { type CollectionInfo, fetchCollections } from '../lib/api.js'
import type { EnrichScope } from '../lib/enrichment-job.js'
import { collectionLabel } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import {
  clearFill,
  FILL_MISSING,
  type FillPlan,
  type FillRun,
  FORCE_REGENERATE,
  META_ONLY,
  startFill,
  useFillRun,
} from '../structure/fill-job.js'
import { FillRunStatus, ScopePicker } from '../structure/fill-run-view.js'
import { useToast } from '../ui/toast.js'
import { ConfirmModal } from './confirm-modal.js'
import { SetupSection, ValuesFrom } from './setup-section.js'

const PLAN_NAMES = new Map<FillPlan, string>([
  [FILL_MISSING, 'Fill missing SEO'],
  [META_ONLY, 'Meta only'],
  [FORCE_REGENERATE, 'Force regenerate'],
])

function scopeName(scope: EnrichScope): string {
  return scope.scope === 'collection' ? `${collectionLabel(scope.collection)}` : 'the whole site'
}

/** How a run ended, in a sentence for its toast */
function outcome(run: FillRun): { text: string; tone?: 'error' } {
  const name = run.state === 'idle' ? 'Enrichment' : (PLAN_NAMES.get(run.plan) ?? 'Enrichment')
  if (run.state === 'failed') return { text: `${name} failed: ${run.message}`, tone: 'error' }
  return { text: `${name} finished. Setup › AI provider lists what each step did.` }
}

/** What each run does and where what it writes lands, said before it runs (§7) */
function RunLead(): ReactElement {
  return (
    <div className="setup-prose">
      <p>
        <strong>Fill missing SEO</strong> writes meta descriptions and the Schema.org properties no
        one has set. <strong>Meta only</strong> writes only the missing meta descriptions. Neither
        overwrites a value someone set. <strong>Force regenerate</strong> writes both over every
        value, the editors' own included.
      </p>
      <p>
        What a run writes is saved at once: each meta description as a new version of its document
        and in the document's SEO settings, the Schema.org properties in those settings. The SEO
        settings have no versions, so the live pages' meta descriptions and structured data change
        straight away. A document someone else is editing keeps its meta description.
      </p>
    </div>
  )
}

/** Force regenerate's danger confirmation: exactly what it overwrites and where it lands */
function ForceConfirm({
  scope,
  model,
  onConfirm,
  onClose,
}: {
  scope: EnrichScope
  model: string
  onConfirm: () => Promise<void>
  onClose: () => void
}): ReactElement {
  return (
    <ConfirmModal
      title={`Force regenerate SEO for ${scopeName(scope)}?`}
      confirmLabel="Overwrite and regenerate"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p>
        {model} writes a new meta description and new Schema.org properties for every document in{' '}
        {scopeName(scope)}. It{' '}
        <strong>overwrites the values there now, the editors' own included</strong>.
      </p>
      <p>
        Each meta description is saved as a new version of its document and in the document's SEO
        settings; the Schema.org properties are written to those settings, which have no versions.
        The live pages' meta descriptions and structured data change at once: this is not a draft,
        there is nothing to publish first, and the SEO settings keep no earlier values to go back
        to. A document someone else is editing keeps its meta description.
      </p>
    </ConfirmModal>
  )
}

export interface SiteRunProps {
  /** An AI is on: enrichment has a model to run on */
  configured: boolean
  /** The API runs enrichment for admins only */
  admin: boolean
  /** The AI a run uses, by name and model */
  model: string
}

function blocker(run: FillRun, admin: boolean, configured: boolean): string | null {
  if (run.state === 'running') return 'Enrichment is running.'
  if (!admin) return 'Enrichment is run by an admin.'
  if (!configured) return 'Add an AI key first.'
  return null
}

function RunButtons({
  reason,
  onRun,
  onForce,
}: {
  reason: string | null
  onRun: (plan: FillPlan) => void
  onForce: () => void
}): ReactElement {
  return (
    <div className="setup-actions">
      <ActionButton
        variant="primary"
        icon={Sparkles}
        reason={reason}
        onClick={() => onRun(FILL_MISSING)}
      >
        Fill missing SEO
      </ActionButton>
      <ActionButton icon={ListChecks} reason={reason} onClick={() => onRun(META_ONLY)}>
        Meta only
      </ActionButton>
      <ActionButton variant="danger" icon={RefreshCcw} reason={reason} onClick={onForce}>
        Force regenerate…
      </ActionButton>
    </div>
  )
}

/** The pages-rendering collections: the scopes a run can take */
function usePageCollections(): CollectionInfo[] {
  const { loaded } = useLoaded(fetchCollections, 'The collections could not be read')
  return loaded.state === 'ready' ? loaded.data.filter((c) => c.pages) : []
}

const RUN_SOURCES = (
  <ValuesFrom source="database">
    Writes to the documents and their SEO settings in the site's database, with the AI in use above.
  </ValuesFrom>
)

/** Run across the site: a scope, then Fill missing SEO, Meta only or Force regenerate (confirmed) */
export function SiteRun({ configured, admin, model }: SiteRunProps): ReactElement {
  const toast = useToast()
  const run = useFillRun()
  const collections = usePageCollections()
  const [scope, setScope] = useState<EnrichScope>({ scope: 'all' })
  const [confirming, setConfirming] = useState(false)
  useEffect(() => () => clearFill(), [])
  const start = useCallback(
    (plan: FillPlan) => startFill(scope, (end) => toast(outcome(end)), plan),
    [scope, toast],
  )
  const reason = blocker(run, admin, configured)
  const running = run.state === 'running'
  const force = async (): Promise<void> => {
    setConfirming(false)
    if (!start(FORCE_REGENERATE)) {
      toast({
        text: 'Another run is going across the site, so Force regenerate did not start. Try again when it ends.',
        tone: 'error',
      })
    }
  }
  return (
    <SetupSection title="Run across the site" sources={RUN_SOURCES}>
      <RunLead />
      <ScopePicker collections={collections} value={scope} disabled={running} onChange={setScope} />
      <RunButtons reason={reason} onRun={start} onForce={() => setConfirming(true)} />
      {reason && !running && <p className="setup-note">{reason}</p>}
      <FillRunStatus run={run} />
      {confirming && (
        <ForceConfirm
          scope={scope}
          model={model}
          onClose={() => setConfirming(false)}
          onConfirm={force}
        />
      )}
    </SetupSection>
  )
}
