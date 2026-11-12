import { ListChecks, Sparkles } from 'lucide-react'
import { type ReactElement, useId, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { STEP_LABELS } from '../lib/enrichment-job.js'
import { hasValidStructuredData } from '../lib/findability.js'
import { Button } from '../ui/button.js'
import { useToast } from '../ui/toast.js'
import { type FillRun, stepPosition } from './fill-job.js'
import type { IntroFigures } from './structure-model.js'
import type { SiteFindings } from './structure-sources.js'

export interface StructureHeaderProps {
  /** The site's name; null until it is read */
  siteName: string | null
  /** Fill what's missing as it stands: while it runs, the header says how far it is */
  fill: FillRun
  validate: () => Promise<SiteFindings | null>
  /** Opens Fill what's missing; null while the site's collections are unread */
  onFill: (() => void) | null
  /** Why Fill what's missing cannot run for this viewer; null when it can */
  fillBlocker: string | null
}

function pages(count: number): string {
  return `${count} live page${count === 1 ? '' : 's'}`
}

/** Validate all pages: read every live page's findings again, and say what they came to */
function ValidateButton({ validate }: Pick<StructureHeaderProps, 'validate'>): ReactElement {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function run(): Promise<void> {
    setBusy(true)
    const findings = await validate()
    setBusy(false)
    if (!findings) {
      toast({ text: "The live pages' findings could not be read.", tone: 'error' })
      return
    }
    const valid = findings.pages.filter(hasValidStructuredData).length
    toast({ text: `Validated ${pages(findings.pages.length)}: ${valid} with a valid graph.` })
  }
  return (
    <Button icon={ListChecks} aria-disabled={busy} onClick={busy ? undefined : () => void run()}>
      {busy ? 'Validating…' : 'Validate all pages'}
    </Button>
  )
}

/** How far a running fill is; open Fill what's missing to follow it */
function FillProgress({ fill }: { fill: FillRun }): ReactElement | null {
  if (fill.state !== 'running') return null
  return (
    <p className="structure-note">
      Filling… {stepPosition(fill.plan, fill.step)} ({STEP_LABELS[fill.step]}). Open Fill what's
      missing to follow it.
    </p>
  )
}

/** "Structure": how search engines and assistants read the site, with Validate and Fill */
export function StructureHeader(props: StructureHeaderProps): ReactElement {
  const site = props.siteName ?? 'the site'
  return (
    <header className="structure-header">
      <div className="structure-header-text">
        <h1 className="structure-title">Structure</h1>
        <p className="structure-lead">
          How search engines and AI assistants read {site}. Every page carries one connected
          Schema.org graph — no one writes JSON-LD by hand.
        </p>
        <div role="status">
          <FillProgress fill={props.fill} />
        </div>
      </div>
      <div className="structure-actions">
        <ValidateButton validate={props.validate} />
        <ActionButton
          variant="primary"
          icon={Sparkles}
          reason={props.onFill ? props.fillBlocker : 'Reading the site…'}
          onClick={() => props.onFill?.()}
        >
          Fill what's missing
        </ActionButton>
      </div>
    </header>
  )
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string
  value: string | null
  detail: string
}): ReactElement {
  return (
    <div className="structure-figure">
      <dt>{label}</dt>
      <dd>
        <span className="structure-figure-value">{value ?? '—'}</span>
        <span className="structure-figure-detail">{value === null ? 'Not read' : detail}</span>
      </dd>
    </div>
  )
}

/** "One graph per page, assembled from four scopes", with the figures that have a source */
export function IntroBand({ figures }: { figures: IntroFigures }): ReactElement {
  const { graphs, siteEntities, rich } = figures
  const titleId = useId()
  return (
    <section className="structure-intro" aria-labelledby={titleId}>
      <h2 id={titleId} className="structure-intro-title">
        One graph per page, assembled from four scopes
      </h2>
      <dl className="structure-figures">
        <Figure
          label="Pages with a valid graph"
          value={graphs ? `${graphs.valid} / ${graphs.pages}` : null}
          detail="Live pages no search engine's rules find an error in"
        />
        <Figure
          label="Site entities"
          value={siteEntities === null ? null : String(siteEntities)}
          detail="In every page's graph, from the site's SEO settings"
        />
        <Figure
          label="Eligible rich results"
          value={rich ? `${rich.eligible} / ${rich.applicable}` : null}
          detail="Features of live pages, by the search engines' rules"
        />
      </dl>
    </section>
  )
}
