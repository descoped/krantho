import { RotateCw, TriangleAlert } from 'lucide-react'
import { type ReactElement, useMemo } from 'react'
import { type AuthUser, useAuth } from '../lib/auth.js'
import { useCapabilities } from '../lib/capabilities.js'
import { locksHeldByOthers } from '../lib/locks.js'
import { type Source, sourceValue } from '../lib/source.js'
import { Button } from '../ui/button.js'
import { EmptyState } from '../ui/empty-state.js'
import { CollectionSummary } from './collection-summary.js'
import { KeyFigures } from './key-figures.js'
import { NeedsAttention } from './needs-attention.js'
import { recentActivity } from './pulse-activity.js'
import { needsAttention } from './pulse-attention.js'
import { PulseHeader } from './pulse-header.js'
import {
  collectionCounts,
  coverageFigure,
  liveFigure,
  pulseScope,
  sitePages,
  structuredDataFigure,
} from './pulse-model.js'
import { PulseSkeleton } from './pulse-skeleton.js'
import type { PulseData } from './pulse-sources.js'
import { RecentActivity } from './recent-activity.js'
import { usePulse } from './use-pulse.js'
import './pulse.css'

/** The sources the list watches, as a sentence's subject */
function watchedSources(data: PulseData): string {
  const watched = ['unpublished changes', 'edit locks', 'pages without a meta description']
  if (data.deliveries.state !== 'off') watched.unshift('failed webhook deliveries')
  if (data.translations.state !== 'off') watched.push('missing locale versions')
  const last = watched.pop()
  const sentence = `${watched.join(', ')} and ${last}`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** The optional sources that failed, named for people */
function unreadSources(data: PulseData): string[] {
  const named: Array<[Source<unknown>, string]> = [
    [data.locks, 'edit locks'],
    [data.deliveries, 'webhook deliveries'],
    [data.translations, 'locale versions'],
  ]
  return named.filter(([source]) => source.state === 'failed').map(([, name]) => name)
}

/** Every figure and list, derived from the loaded sources */
function usePulseView(data: PulseData, user: AuthUser | null) {
  return useMemo(() => {
    const now = Date.now()
    const scope = pulseScope(data.collections, data.locales.defaultLocale)
    const pages = sitePages(data.documents, scope)
    const locks = sourceValue(data.locks)
    const findings = data.findings
    return {
      now,
      live: liveFigure(pages),
      coverage: coverageFigure(pages),
      structuredData:
        findings.state === 'ok'
          ? { state: 'ok' as const, value: structuredDataFigure(findings.value) }
          : findings,
      attention: needsAttention({
        documents: data.documents,
        scope,
        locks: locks ? locksHeldByOthers(locks, user, now) : null,
        deliveries: sourceValue(data.deliveries),
        translations: sourceValue(data.translations),
      }),
      collections: collectionCounts(data.collections, data.documents, scope.defaultLocale),
      activity: recentActivity(data.documents),
    }
  }, [data, user])
}

function PulseBody({ data, user }: { data: PulseData; user: AuthUser | null }): ReactElement {
  const view = usePulseView(data, user)
  return (
    <>
      <KeyFigures live={view.live} coverage={view.coverage} structuredData={view.structuredData} />
      <div className="pulse-columns">
        <NeedsAttention
          attention={view.attention}
          watched={watchedSources(data)}
          unread={unreadSources(data)}
        />
        <CollectionSummary collections={view.collections} />
      </div>
      <RecentActivity
        entries={view.activity}
        defaultLocale={data.locales.defaultLocale}
        now={view.now}
      />
    </>
  )
}

function PulseError({ message, onRetry }: { message: string; onRetry: () => void }): ReactElement {
  return (
    <div className="pulse-panel" role="alert">
      <EmptyState
        icon={TriangleAlert}
        title="Pulse could not load"
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

/** Pulse: what needs the editor, the site's key figures, its collections and recent activity */
export function PulsePage(): ReactElement {
  const { pulse, reload } = usePulse()
  const { user, hasRole } = useAuth()
  const caps = useCapabilities()
  const data = pulse.state === 'ready' ? pulse.data : null
  const pageCollection = hasRole('editor')
    ? (data?.collections.find((collection) => collection.pages) ?? null)
    : null

  return (
    <div className="pulse" aria-busy={pulse.state === 'loading'}>
      <PulseHeader
        site={data?.site ?? null}
        loading={pulse.state === 'loading'}
        framework={caps.framework}
        pageCollection={pageCollection}
      />
      {pulse.state === 'loading' && (
        <p className="visually-hidden" role="status">
          Loading Pulse…
        </p>
      )}
      {pulse.state === 'error' && <PulseError message={pulse.message} onRetry={reload} />}
      {pulse.state === 'loading' && <PulseSkeleton />}
      {data && <PulseBody data={data} user={user} />}
    </div>
  )
}
