import { ExternalLink } from 'lucide-react'
import { type ReactElement, useCallback } from 'react'
import type { SitemapUrl } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import { safeHref } from '../lib/guards.js'
import { servedFailure, servedOk } from '../lib/served.js'
import { useLoaded } from '../site/use-loaded.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { type CrawlerData, loadCrawlerData, type SitemapRead } from './crawler-sources.js'
import { llmsOriginText, type SitemapEntry, servedFrom } from './crawlers-model.js'
import { RobotsCard } from './robots-card.js'
import { StructureCard } from './structure-card.js'
import type { TabProps } from './structure-page.js'
import { configOf } from './structure-sources.js'

const SITEMAP_COLUMNS: readonly DataColumn<SitemapEntry>[] = [
  {
    id: 'loc',
    header: 'URL',
    primary: true,
    cell: (entry) => {
      const href = safeHref(entry.loc)
      if (!href) return entry.loc
      return (
        <a href={href} target="_blank" rel="noreferrer" className="structure-link">
          {entry.loc}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )
    },
  },
  {
    id: 'lastmod',
    header: 'Last modified',
    cell: (entry) => (entry.lastmod ? `${formatDateTime(entry.lastmod)} UTC` : '—'),
  },
  { id: 'changefreq', header: 'Change frequency', cell: (entry) => entry.changefreq ?? '—' },
  { id: 'priority', header: 'Priority', numeric: true, cell: (entry) => entry.priority ?? '—' },
]

function SitemapTable({
  entries,
  caption,
}: {
  entries: readonly SitemapEntry[]
  caption: string
}): ReactElement {
  if (entries.length === 0) return <p className="structure-note">It lists no URL.</p>
  return (
    <DataTable
      caption={caption}
      columns={SITEMAP_COLUMNS}
      rows={entries}
      rowKey={(entry) => entry.loc}
    />
  )
}

const fromKrantho = (urls: readonly SitemapUrl[]): SitemapEntry[] => urls.map((url) => ({ ...url }))

function SitemapCard({ sitemap }: { sitemap: SitemapRead }): ReactElement {
  const { served, entries, krantho } = sitemap
  if (!servedOk(served)) {
    return (
      <StructureCard
        title="Sitemap"
        lead={`${servedFailure(served)} What krantho's API builds at /api/seo/sitemap from the live pages:`}
      >
        {krantho ? (
          <SitemapTable entries={fromKrantho(krantho)} caption="Sitemap krantho builds" />
        ) : (
          <p className="structure-note">krantho's sitemap could not be read either.</p>
        )}
      </StructureCard>
    )
  }
  return (
    <StructureCard
      title="Sitemap"
      lead={`As the site serves it at /sitemap.xml${entries ? `: ${entries.length} URL${entries.length === 1 ? '' : 's'}` : ''}. krantho lists every live, indexable page of the collections with pages.`}
    >
      {entries ? (
        <SitemapTable entries={entries} caption="Sitemap as served" />
      ) : (
        <p className="structure-note">What the site serves at /sitemap.xml is not a sitemap.</p>
      )}
    </StructureCard>
  )
}

function LlmsCard({ llms }: { llms: CrawlerData['llms'] }): ReactElement {
  const { served, krantho } = llms
  if (!servedOk(served)) {
    return (
      <StructureCard
        title="llms.txt"
        lead={`${servedFailure(served)} krantho's API serves one at /api/seo/llms.txt; route /llms.txt to it to serve it.`}
      />
    )
  }
  const from = krantho ? servedFrom(served, krantho.text) : null
  return (
    <StructureCard
      title="llms.txt"
      lead={
        <>
          As the site serves it at /llms.txt, read-only.{' '}
          {llmsOriginText(from, krantho?.origin ?? null)}
        </>
      }
    >
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region is reachable by keyboard */}
      <section className="structure-text" tabIndex={0} aria-label="llms.txt as served">
        <pre>{served.text}</pre>
      </section>
      <a href="/llms.txt" target="_blank" rel="noreferrer" className="structure-link">
        Open /llms.txt
        <ExternalLink aria-hidden="true" />
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </StructureCard>
  )
}

/** Crawlers & assistants: the sitemap as served, robots.txt with its override, llms.txt read-only */
export function CrawlersTab({ base, admin, state }: TabProps): ReactElement {
  const load = useCallback(() => loadCrawlerData(), [])
  const { loaded, reload } = useLoaded(load, 'What crawlers read could not be read')
  const site = base.configs.state === 'ok' ? configOf(base.configs.value, 'site') : null
  const onSaved = useCallback(() => {
    reload()
    state.reloadBase()
  }, [reload, state])
  if (loaded.state === 'loading')
    return <p className="structure-note">Reading what the site serves…</p>
  if (loaded.state === 'error')
    return <p className="structure-note structure-note--error">{loaded.message}</p>
  return (
    <>
      <p className="structure-tab-lead">
        What search engines and assistants fetch from the site's own addresses, read as they read
        them.
      </p>
      <SitemapCard sitemap={loaded.data.sitemap} />
      <RobotsCard
        robots={loaded.data.robots}
        site={site?.config ?? null}
        admin={admin}
        onSaved={onSaved}
      />
      <LlmsCard llms={loaded.data.llms} />
    </>
  )
}
