import { CircleAlert, CircleCheck } from 'lucide-react'
import { type ReactElement, useId } from 'react'
import type { SeoLimits } from '../../lib/api-types.js'
import { runChecks } from '../../lib/seo-checks.js'
import { Chip } from '../../ui/chip.js'
import type { Draft } from '../editor-model.js'
import { DataCard } from './data-card.js'
import { DataField, textOf } from './data-field.js'
import type { PagePreview } from './preview-model.js'
import { SerpPreview } from './serp-preview.js'

/** How the page may show in search results, from the draft as it is now */
export function SearchResultCard({ preview }: { preview: PagePreview }): ReactElement {
  return (
    <DataCard
      title="Search result"
      lead="From the draft's current values, before you save. The live page changes when you publish."
    >
      <SerpPreview title={preview.title} description={preview.description} url={preview.url} />
    </DataCard>
  )
}

/** The page's basic checks, from the draft: title and meta description against the site's limits, body, headings, links */
export function ChecksCard({
  draft,
  limits,
}: {
  draft: Draft
  limits: SeoLimits | null
}): ReactElement {
  const checks = runChecks(draft.fields, draft.body, limits)
  const open = checks.filter((check) => !check.pass).length
  return (
    <DataCard
      title="Checks"
      aside={
        <Chip tone={open === 0 ? 'success' : 'warning'}>
          {open === 0 ? 'All pass' : `${open} to review`}
        </Chip>
      }
    >
      <ul className="data-checks" aria-label="Checks">
        {checks.map((check) => (
          <li
            key={check.label}
            className={check.pass ? 'data-check' : 'data-check data-check--open'}
          >
            {check.pass ? (
              <CircleCheck className="data-check-icon" role="img" aria-label="Passes" />
            ) : (
              <CircleAlert className="data-check-icon" role="img" aria-label="To review" />
            )}
            <span className="data-check-label">{check.label}</span>
            <span className="data-check-hint">{check.hint}</span>
          </li>
        ))}
      </ul>
    </DataCard>
  )
}

export interface IndexingCardProps {
  fields: Readonly<Record<string, unknown>>
  /** The page's own address, which the page emits when no canonical URL is set */
  pageUrl: string | null
  readOnly: boolean
  onField: (name: string, value: unknown) => void
}

/** A robots directive as a checkbox: on unless the field says false */
function RobotsToggle({
  name,
  label,
  hint,
  fields,
  onField,
}: {
  name: 'robots-index' | 'robots-follow'
  label: string
  hint: string
  fields: IndexingCardProps['fields']
  onField: IndexingCardProps['onField']
}): ReactElement {
  return (
    <label className="data-toggle">
      <input
        type="checkbox"
        checked={fields[name] !== false}
        onChange={(event) => onField(name, event.target.checked)}
      />
      <span>{label}</span>
      <span className="data-toggle-hint">{hint}</span>
    </label>
  )
}

/** The canonical address; empty, the page's own address */
function CanonicalField({
  fields,
  pageUrl,
  onField,
}: Omit<IndexingCardProps, 'readOnly'>): ReactElement {
  const id = useId()
  return (
    <DataField
      id={id}
      label="canonical-url"
      help={pageUrl ? `Empty: the page's own address, ${pageUrl}` : undefined}
    >
      <input
        id={id}
        type="url"
        className="editor-control"
        value={textOf(fields['canonical-url'])}
        placeholder={pageUrl ?? undefined}
        aria-describedby={pageUrl ? `${id}-help` : undefined}
        onChange={(event) => onField('canonical-url', event.target.value)}
      />
    </DataField>
  )
}

/** Whether search engines may index the page and follow its links, and its canonical address */
export function IndexingCard({
  fields,
  pageUrl,
  readOnly,
  onField,
}: IndexingCardProps): ReactElement {
  const index = fields['robots-index'] !== false ? 'index' : 'noindex'
  const follow = fields['robots-follow'] !== false ? 'follow' : 'nofollow'
  return (
    <DataCard
      title="Indexing"
      lead="Saved with the draft, as the fields canonical-url, robots-index and robots-follow."
    >
      <fieldset className="data-fields" disabled={readOnly}>
        <legend className="visually-hidden">Indexing</legend>
        <CanonicalField fields={fields} pageUrl={pageUrl} onField={onField} />
        <RobotsToggle
          name="robots-index"
          label="Index"
          hint="Search engines may list the page"
          fields={fields}
          onField={onField}
        />
        <RobotsToggle
          name="robots-follow"
          label="Follow"
          hint="Search engines may follow its links"
          fields={fields}
          onField={onField}
        />
        <code className="data-tag">{`<meta name="robots" content="${index}, ${follow}" />`}</code>
      </fieldset>
    </DataCard>
  )
}
