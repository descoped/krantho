import { RotateCw, TriangleAlert } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../lib/auth.js'
import type { EnrichScope } from '../lib/enrichment-job.js'
import { STRUCTURE_TABS, type StructureTabId } from '../shell/destinations.js'
import { Button } from '../ui/button.js'
import { EmptyState } from '../ui/empty-state.js'
import { RouteTabs } from '../ui/tabs.js'
import { useToast } from '../ui/toast.js'
import { CrawlersTab } from './crawlers-tab.js'
import { clearFill, type FillRun, startFill, useFillRun } from './fill-job.js'
import { FillMissing } from './fill-missing.js'
import { GraphTab } from './graph-tab.js'
import { RichResultsTab } from './rich-results-tab.js'
import { ScopesTab } from './scopes-tab.js'
import { IntroBand, StructureHeader } from './structure-header.js'
import { introFigures } from './structure-model.js'
import type { StructureBase } from './structure-sources.js'
import { type StructureState, useStructure } from './use-structure.js'
import './structure.css'

/** The parameter that opens Fill what's missing on arrival (the palette's Enrich missing SEO) */
const FILL_PARAM = 'fill'

/** What a tab gets: the shared sources, and whether this viewer may change the SEO settings */
export interface TabProps {
  base: StructureBase
  state: StructureState
  /** The API lets admins change SEO settings and run enrichment */
  admin: boolean
}

function TabContent({ tab, ...props }: TabProps & { tab: StructureTabId }): ReactElement {
  switch (tab) {
    case 'graph':
      return <GraphTab {...props} />
    case 'scopes':
      return <ScopesTab {...props} />
    case 'rich-results':
      return <RichResultsTab {...props} />
    case 'crawlers':
      return <CrawlersTab {...props} />
  }
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }): ReactElement {
  return (
    <div role="alert">
      <EmptyState
        icon={TriangleAlert}
        title="Structure could not load"
        action={
          <Button icon={RotateCw} onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {message}
      </EmptyState>
    </div>
  )
}

/** Fill what's missing: open on request, or on arrival from the palette */
function useFillDialog(): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (params.get(FILL_PARAM) === null) return
    setOpen(true)
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(FILL_PARAM)
        return next
      },
      { replace: true },
    )
  }, [params, setParams])
  return [open, setOpen]
}

/** What a finished fill came to, in a sentence for its toast */
function fillOutcome(run: FillRun): { text: string; tone?: 'error' } {
  if (run.state === 'failed')
    return { text: `Fill what's missing failed: ${run.message}`, tone: 'error' }
  return { text: "Fill what's missing finished. Open it to see what each step filled." }
}

/**
 * Fill what's missing as Studio runs it: started here, it runs to its end
 * whether or not the dialog or Structure stays open; its end is toasted, and
 * Structure reads its sources again while it is open
 */
function useFill(reloadBase: () => void): {
  run: FillRun
  start: (target: EnrichScope) => void
} {
  const run = useFillRun()
  const toast = useToast()
  const start = useCallback(
    (target: EnrichScope) => startFill(target, (end) => toast(fillOutcome(end))),
    [toast],
  )
  const running = run.state === 'running'
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) reloadBase()
    wasRunning.current = running
  }, [running, reloadBase])
  return { run, start }
}

/** The tabs and the open tab's panel, labelled by its tab */
function StructureTabs(props: {
  tab: StructureTabId
  state: StructureState
  admin: boolean
}): ReactElement {
  const { tab, state } = props
  const ids = useId()
  const tabId = useCallback((id: string) => `${ids}-tab-${id}`, [ids])
  return (
    <>
      <RouteTabs
        label="Structure"
        tabs={STRUCTURE_TABS}
        current={tab}
        tabId={tabId}
        panelId={`${ids}-panel`}
      />
      <div
        id={`${ids}-panel`}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="structure-panel"
      >
        {state.base.state === 'loading' && <p className="structure-note">Reading Structure…</p>}
        {state.base.state === 'error' && (
          <LoadFailure message={state.base.message} onRetry={state.reloadBase} />
        )}
        {state.base.state === 'ready' && (
          <TabContent tab={tab} base={state.base.data} state={state} admin={props.admin} />
        )}
      </div>
    </>
  )
}

/**
 * Structure: how search engines and assistants read the site. A header with
 * Validate all pages and Fill what's missing, the intro band's figures, and
 * the tabs — Graph, Scopes & archetypes, Rich results, Crawlers & assistants.
 */
export function StructurePage({ tab }: { tab: StructureTabId }): ReactElement {
  const state = useStructure()
  const admin = useAuth().hasRole('admin')
  const [fillOpen, setFillOpen] = useFillDialog()
  const fill = useFill(state.reloadBase)
  const closeFill = useCallback(() => {
    setFillOpen(false)
    clearFill()
  }, [setFillOpen])
  const base = state.base.state === 'ready' ? state.base.data : null
  const figures = useMemo(() => introFigures(base, state.findings), [base, state.findings])
  return (
    <div className="structure" aria-busy={state.base.state === 'loading'}>
      <StructureHeader
        siteName={base?.site.site.name ?? null}
        fill={fill.run}
        validate={state.validate}
        onFill={base ? () => setFillOpen(true) : null}
        fillBlocker={admin ? null : 'Enrichment is run by an admin.'}
      />
      <IntroBand figures={figures} />
      <StructureTabs tab={tab} state={state} admin={admin} />
      {fillOpen && base && (
        <FillMissing
          collections={base.collections.filter((collection) => collection.pages)}
          admin={admin}
          run={fill.run}
          onStart={fill.start}
          onClose={closeFill}
        />
      )}
    </div>
  )
}
