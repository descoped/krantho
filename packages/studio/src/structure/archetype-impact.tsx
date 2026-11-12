import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { CollectionImpactResponse } from '../lib/api.js'
import { dataModePath } from '../lib/paths.js'
import type { Impact } from './use-archetype-impact.js'

type AffectedDocument = CollectionImpactResponse['affectedDocuments'][number]

const named = (properties: ReadonlyArray<{ entityType: string; property: string }>): string =>
  properties.map((p) => `${p.entityType}.${p.property}`).join(', ')

/** One page the change touches: the values it would keep unread, and those it would lack */
function AffectedLine({
  doc,
  collection,
}: {
  doc: AffectedDocument
  collection: string
}): ReactElement {
  return (
    <li>
      <Link to={dataModePath(collection, doc.slug)} className="structure-link">
        {doc.title || doc.slug}
      </Link>
      {doc.orphanedProperties.length > 0 && <span> · unused: {named(doc.orphanedProperties)}</span>}
      {doc.missingRequired.length > 0 && <span> · missing: {named(doc.missingRequired)}</span>}
    </li>
  )
}

function AffectedDocuments({
  impact,
  collection,
}: {
  impact: CollectionImpactResponse
  collection: string
}): ReactElement {
  if (impact.affectedDocuments.length === 0) {
    return <p>No page of the collection would lose a value or lack a required one.</p>
  }
  const { summary } = impact
  return (
    <>
      <p>
        Of {impact.totalDocuments} pages, {summary.documentsWithOrphans} would keep values no chosen
        type reads, and {summary.documentsWithMissingRequired} would lack values a chosen type
        requires:
      </p>
      <ul className="structure-impact-list">
        {impact.affectedDocuments.map((doc) => (
          <AffectedLine key={doc.slug} doc={doc} collection={collection} />
        ))}
      </ul>
    </>
  )
}

/** What the change does to the collection's pages, said as it is read */
export function ImpactNote({
  impact,
  collection,
}: {
  impact: Impact
  collection: string
}): ReactElement {
  return (
    <div className="structure-impact" aria-live="polite">
      <h3 className="structure-label">What the change does to the pages</h3>
      {impact.state === 'idle' && <p>Change the types to see which pages it touches.</p>}
      {impact.state === 'reading' && <p>Checking the collection's pages…</p>}
      {impact.state === 'error' && <p>The impact could not be read.</p>}
      {impact.state === 'ready' && (
        <AffectedDocuments impact={impact.impact} collection={collection} />
      )}
    </div>
  )
}
