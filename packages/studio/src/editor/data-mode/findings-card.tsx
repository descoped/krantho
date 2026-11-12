import type { ReactElement } from 'react'
import type { Loaded } from '../../site/use-loaded.js'
import { DataCard, DataNote } from './data-card.js'
import { ReaderFindings } from './reader-findings.js'
import type { DocumentFindings } from './use-data-sources.js'

/** The saved version's findings, per search engine */
export function FindingsCard({
  findings,
  version,
}: {
  findings: Loaded<DocumentFindings>
  version: number
}): ReactElement {
  return (
    <DataCard
      title="Findings per search engine"
      lead={`The saved version, v${version}, checked against Schema.org and the rules of each search engine the site targets. Errors make the markup invalid; warnings keep the page from a search feature.`}
    >
      {findings.state === 'loading' && <DataNote>Checking…</DataNote>}
      {findings.state === 'error' && <DataNote tone="error">{findings.message}</DataNote>}
      {findings.state === 'ready' && (
        <ReaderFindings findings={findings.data.findings} readers={findings.data.readers} />
      )}
    </DataCard>
  )
}
