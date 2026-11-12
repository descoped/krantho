import { type ReactElement, useEffect, useState } from 'react'
import type { SeoFinding } from '../lib/api-assistant.js'
import { fetchSeoFindings, type SeoReader } from '../lib/api-seo.js'
import { FindingItem, SEVERITIES } from './finding-item.js'

/** The SEO findings of the saved version a publication would make live */
export type PublishFindings =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; findings: SeoFinding[]; readers: SeoReader[] }

export interface PublishFindingsTarget {
  /** SEO is on and the collection renders pages */
  seo: boolean
  collection: string
  slug: string
  locale: string
  /** The saved version being published: a new one is read again */
  version: number
}

/**
 * The saved version's findings (`GET /api/seo/findings/:c/:s`), the same
 * answer Data mode and the side panel read. Informational: it never decides
 * whether a page can be published.
 */
export function usePublishFindings(target: PublishFindingsTarget): PublishFindings {
  const { seo, collection, slug, locale, version } = target
  const [findings, setFindings] = useState<PublishFindings>({ state: 'loading' })
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new saved version reads its findings again
  useEffect(() => {
    if (!seo) return
    let active = true
    setFindings({ state: 'loading' })
    fetchSeoFindings(collection, slug, locale)
      .then((read) => active && setFindings({ state: 'ready', ...read }))
      .catch(() => active && setFindings({ state: 'error' }))
    return () => {
      active = false
    }
  }, [seo, collection, slug, locale, version])
  return seo ? findings : { state: 'off' }
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Errors and warnings, errors first; notes are not shown here */
function actionable(findings: readonly SeoFinding[]): SeoFinding[] {
  return findings
    .filter((finding) => finding.severity !== 'info')
    .sort((a, b) => SEVERITIES[a.severity].order - SEVERITIES[b.severity].order)
}

/**
 * What the search engines would find wrong with the version being published,
 * from the API: nothing is shown when SEO is off
 */
export function PublishFindingsSection({
  findings,
  version,
}: {
  findings: PublishFindings
  version: number
}): ReactElement | null {
  if (findings.state === 'off') return null
  if (findings.state === 'loading') {
    return (
      <p role="status" className="editor-publish-findings">
        Checking the page's SEO findings…
      </p>
    )
  }
  if (findings.state === 'error') {
    return (
      <p className="editor-publish-findings">
        The page's SEO findings could not be read. Publishing still works.
      </p>
    )
  }
  const shown = actionable(findings.findings)
  if (shown.length === 0) {
    return <p className="editor-publish-findings">No SEO errors or warnings in v{version}.</p>
  }
  const errors = shown.filter((finding) => finding.severity === 'error').length
  const names = new Map(findings.readers.map((reader) => [reader.id, reader.name]))
  return (
    <div className="editor-publish-findings">
      <p>
        SEO findings in v{version}: {count(errors, 'error')} ·{' '}
        {count(shown.length - errors, 'warning')}. They do not stop publishing.
      </p>
      <ul className="editor-findings">
        {shown.map((finding, index) => (
          <FindingItem
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
            key={`${finding.code ?? finding.check}-${finding.property ?? ''}-${index}`}
            finding={finding}
            reader={finding.reader ? (names.get(finding.reader) ?? finding.reader) : undefined}
          />
        ))}
      </ul>
    </div>
  )
}
