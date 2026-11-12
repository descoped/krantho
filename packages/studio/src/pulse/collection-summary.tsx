import { collectionBasePath } from '@krantho/core/cache-tags'
import { FolderTree } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { DocumentStatus } from '../lib/document-status.js'
import { collectionLabel } from '../lib/format.js'
import { collectionPath } from '../lib/paths.js'
import { EmptyState } from '../ui/empty-state.js'
import { StatusDot } from '../ui/status-dot.js'
import type { CollectionCounts } from './pulse-model.js'
import './collection-summary.css'

/** The words the site tree's legend uses for each status */
const COUNT_WORDS: Readonly<Record<DocumentStatus, string>> = {
  live: 'live',
  ahead: 'draft ahead',
  draft: 'draft',
}

function Count({ status, count }: { status: DocumentStatus; count: number }): ReactElement {
  return (
    <span className={`collection-count${count === 0 ? ' collection-count--zero' : ''}`}>
      <StatusDot status={status} decorative />
      <span className="collection-count-number">{count}</span> {COUNT_WORDS[status]}
    </span>
  )
}

function CollectionRow({ counts }: { counts: CollectionCounts }): ReactElement {
  const { collection, live, ahead, draft } = counts
  const urlPath = collectionBasePath(collection)
  return (
    <li>
      <Link to={collectionPath(collection.name)} className="collection-row">
        <span className="collection-name">
          {collectionLabel(collection.name)}
          {urlPath !== null && <code className="collection-path">{urlPath}</code>}
        </span>
        <span className="collection-counts">
          <Count status="live" count={live} />
          {ahead > 0 && <Count status="ahead" count={ahead} />}
          <Count status="draft" count={draft} />
        </span>
      </Link>
    </li>
  )
}

/** Each collection with its live and draft counts, opening its collection view */
export function CollectionSummary({
  collections,
}: {
  collections: readonly CollectionCounts[]
}): ReactElement {
  return (
    <section className="pulse-panel" aria-labelledby="pulse-collections-title">
      <div className="pulse-panel-head">
        <h2 id="pulse-collections-title">Collections</h2>
      </div>
      {collections.length === 0 ? (
        <EmptyState icon={FolderTree} title="No collections">
          Collections are defined in code, in <code>krantho.collections.ts</code>.
        </EmptyState>
      ) : (
        <ul className="collection-list">
          {collections.map((counts) => (
            <CollectionRow key={counts.collection.name} counts={counts} />
          ))}
        </ul>
      )}
    </section>
  )
}
