import { CircleCheck } from 'lucide-react'
import { type ReactElement, useId } from 'react'
import type { SeoFinding } from '../../lib/api-assistant.js'
import type { SeoReader } from '../../lib/api-seo.js'
import { Chip, type ChipTone } from '../../ui/chip.js'
import { FindingItem, SEVERITIES } from '../finding-item.js'

/** A group of findings: the page's own checks, Schema.org, or one search engine */
export interface FindingGroup {
  id: string
  label: string
  findings: SeoFinding[]
}

/** The findings in groups — title and meta description, Schema.org, then each reader in order — each sorted by severity */
export function findingGroups(
  findings: readonly SeoFinding[],
  readers: readonly SeoReader[],
): FindingGroup[] {
  const groups: FindingGroup[] = [
    { id: 'page', label: 'Title and meta description', findings: [] },
    { id: 'schema.org', label: 'Schema.org', findings: [] },
    ...readers.map((reader) => ({ id: reader.id, label: reader.name, findings: [] })),
  ]
  for (const finding of findings) {
    const id = finding.check === 'structured-data' ? (finding.reader ?? 'schema.org') : 'page'
    let group = groups.find((g) => g.id === id)
    if (!group) {
      group = { id, label: id, findings: [] }
      groups.push(group)
    }
    group.findings.push(finding)
  }
  const order = (finding: SeoFinding): number => SEVERITIES[finding.severity].order
  for (const group of groups) group.findings.sort((a, b) => order(a) - order(b))
  return groups
}

/** A group's summary: its errors and warnings, in the tone of the worst */
function summary(findings: readonly SeoFinding[]): { tone: ChipTone; text: string } {
  const errors = findings.filter((f) => f.severity === 'error').length
  const warnings = findings.filter((f) => f.severity === 'warning').length
  if (errors > 0) return { tone: 'danger', text: `${errors} error${errors === 1 ? '' : 's'}` }
  if (warnings > 0)
    return { tone: 'warning', text: `${warnings} warning${warnings === 1 ? '' : 's'}` }
  return { tone: 'success', text: 'Passes' }
}

function Group({ group }: { group: FindingGroup }): ReactElement {
  const id = useId()
  const { tone, text } = summary(group.findings)
  return (
    <section className="data-finding-group" aria-labelledby={id}>
      <div className="data-finding-head">
        <h3 id={id} className="data-finding-title">
          {group.label}
        </h3>
        <Chip tone={tone}>{text}</Chip>
      </div>
      {group.findings.length === 0 ? (
        <p className="data-finding-clean">
          <CircleCheck aria-hidden="true" />
          No findings.
        </p>
      ) : (
        <ul className="data-finding-list">
          {group.findings.map((finding, index) => (
            <FindingItem
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
              key={`${finding.code ?? finding.check}-${finding.property ?? ''}-${index}`}
              finding={finding}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * A document's findings per search engine: its title and meta description,
 * its structured data against Schema.org, and against each active reader's
 * rules, each finding linking the documentation it cites
 */
export function ReaderFindings({
  findings,
  readers,
}: {
  findings: readonly SeoFinding[]
  readers: readonly SeoReader[]
}): ReactElement {
  return (
    <div className="data-findings">
      {findingGroups(findings, readers).map((group) => (
        <Group key={group.id} group={group} />
      ))}
    </div>
  )
}
