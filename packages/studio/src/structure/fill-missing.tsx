import { Sparkles } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { Link } from 'react-router'
import { ActionButton } from '../editor/action-button.js'
import { type LlmProvider, useLlmProvider } from '../hooks/use-llm-provider.js'
import type { CollectionInfo } from '../lib/api.js'
import type { EnrichScope } from '../lib/enrichment-job.js'
import { AI_SETUP_PATH } from '../lib/paths.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import type { FillRun } from './fill-job.js'
import { FillRunStatus, fillBlocker, ScopePicker } from './fill-run-view.js'

export interface FillMissingProps {
  /** The collections whose documents render as pages: the scopes a fill can take */
  collections: readonly CollectionInfo[]
  /** The API runs enrichment for admins only */
  admin: boolean
  /** The fill as it stands: it runs on whether or not this dialog is open */
  run: FillRun
  onStart: (target: EnrichScope) => void
  onClose: () => void
}

/** Why a fill cannot run: where to set up a language model, or the reason */
function Blocked({
  provider,
  reason,
}: {
  provider: LlmProvider
  reason: string | null
}): ReactElement | null {
  if (provider === 'missing') {
    return (
      <p className="structure-note">
        No language model is set up. Set one up in{' '}
        <Link to={AI_SETUP_PATH}>Setup › AI provider</Link>.
      </p>
    )
  }
  return reason ? <p className="structure-note">{reason}</p> : null
}

/** What a fill does and where what it fills lands, said before it runs (§7) */
function FillLead(): ReactElement {
  return (
    <p className="structure-modal-lead">
      Fills what is <em>missing</em> — meta descriptions and the Schema.org properties no one has
      set — with the language model set up in Setup › AI provider. It never overwrites a value
      someone set. What it fills is saved to each document at once: the meta description as a new
      version and in the document's SEO settings, the Schema.org properties in those settings. The
      SEO settings have no versions, so the structured data on the live pages — and the meta
      descriptions the site reads from them first — change straight away.
    </p>
  )
}

/**
 * Fill what's missing: enrichment over the whole site or one collection, on
 * request. It fills what is missing, never overwrites, and says where what it
 * fills lands (§7).
 */
export function FillMissing({
  collections,
  admin,
  run,
  onStart,
  onClose,
}: FillMissingProps): ReactElement {
  const [scope, setScope] = useState<EnrichScope>({ scope: 'all' })
  const provider = useLlmProvider()
  const running = run.state === 'running'
  const reason = running ? 'Enrichment is running.' : fillBlocker(admin, provider)
  const actions = (
    <>
      <Button onClick={onClose}>{running ? 'Close (it keeps running)' : 'Close'}</Button>
      <ActionButton
        variant="primary"
        icon={Sparkles}
        reason={reason}
        onClick={() => onStart(scope)}
      >
        Fill what's missing
      </ActionButton>
    </>
  )
  return (
    <Modal title="Fill what's missing" onClose={onClose} actions={actions}>
      <FillLead />
      <ScopePicker collections={collections} value={scope} disabled={running} onChange={setScope} />
      {!running && <Blocked provider={provider} reason={reason} />}
      <FillRunStatus run={run} />
    </Modal>
  )
}
