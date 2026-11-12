import { FileQuestion, Info } from 'lucide-react'
import type { ReactElement } from 'react'
import type { PublishImpact } from '../lib/api.js'
import type { DocumentMeta } from '../lib/api-types.js'
import { EmptyState } from '../ui/empty-state.js'
import { DataCard, DataNote } from './data-mode/data-card.js'
import { DocumentHistory } from './data-mode/data-mode.js'
import { usePublishImpact } from './publish-modal.js'
import type { Workspace } from './use-workspace.js'
import './data-mode/data-mode.css'
import './globals-editor.css'

/*
 * The globals editor's own mode. A global (`/layout/:slug`) is edited in
 * Fields — Structure mode's form, without a body or a side panel — and has no
 * page of its own, so no Live or Data mode and no Open on site: Where it
 * appears takes their place.
 */

/** What a global is, said where its pages would be */
export const GLOBAL_BANNER =
  'A global has no page of its own. Publishing it marks every page that reads it stale; they refresh as visitors open them.'

function Banner(): ReactElement {
  return (
    <p className="globals-banner" role="note">
      <Info className="globals-banner-icon" aria-hidden="true" />
      <span>{GLOBAL_BANNER}</span>
    </p>
  )
}

function cachedEntriesText(count: number): string {
  const entries = count === 1 ? '1 cached entry' : `${count} cached entries`
  return `${entries} in the site's shared page cache carry it now — pages and data alike, so not a count of pages.`
}

/**
 * The pages that read the global, exactly as the API reports what publishing
 * it refreshes: page paths when it names them, the rule when it knows only
 * the rule, and the cached-entry count only when it has one — never a list or
 * a count of its own
 */
function Readers({ impact }: { impact: PublishImpact }): ReactElement {
  const { paths, everyPageReading, cachedEntries } = impact
  return (
    <>
      {paths.length > 0 && (
        <ul className="globals-paths" aria-label="The pages publishing refreshes">
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
      {everyPageReading && (
        <p className="globals-rule">
          Every page that reads it. krantho knows this rule, not a list of those pages, so none is
          named here.
        </p>
      )}
      {cachedEntries !== null && <DataNote>{cachedEntriesText(cachedEntries)}</DataNote>}
    </>
  )
}

/** The pages that read the global, as far as krantho knows (`GET …/publish-impact`) */
function PagesThatRead({ meta }: { meta: DocumentMeta }): ReactElement {
  const impact = usePublishImpact(meta.collection, meta.slug, meta.locale)
  return (
    <DataCard
      title="Pages that read it"
      lead="As far as krantho knows: what publishing it refreshes."
    >
      {impact.state === 'loading' && <DataNote>Reading which pages read it…</DataNote>}
      {impact.state === 'error' && (
        <DataNote tone="error">Which pages read it could not be read.</DataNote>
      )}
      {impact.state === 'ready' && <Readers impact={impact.impact} />}
    </DataCard>
  )
}

/**
 * Where it appears: the §4 banner, the pages that read the global as far as
 * krantho knows, and the history of the locale version being edited
 */
export function WhereItAppears({ ws }: { ws: Workspace }): ReactElement {
  const { document } = ws
  return (
    <div className="data-mode">
      <Banner />
      {document ? (
        <>
          <PagesThatRead meta={document.meta} />
          <DocumentHistory ws={ws} document={document} />
        </>
      ) : (
        <EmptyState icon={FileQuestion} title="Nothing saved yet">
          Where it appears reads the saved global and its history. Save it first.
        </EmptyState>
      )}
    </div>
  )
}
