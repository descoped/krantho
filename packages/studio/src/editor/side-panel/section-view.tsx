import { type ReactElement, useId } from 'react'
import { Chip } from '../../ui/chip.js'
import { metaLengthState } from './findability-model.js'
import { LengthMeter } from './length-meter.js'
import {
  isDesigned,
  leadOf,
  sectionAt,
  sectionKey,
  sectionMetaField,
  wordCount,
} from './page-sections.js'
import { Fact, PanelCard, PanelNote } from './panel-card.js'
import type { PanelDocument } from './panel-document.js'

const PROSE_HINT =
  'Not in the contract. Rename it to a contract heading to get the designed layout, or keep it as prose.'

/** The section's own meta description: an optional document field, `meta-description-<section>` */
function SectionMeta({ doc, heading }: { doc: PanelDocument; heading: string }): ReactElement {
  const id = useId()
  const field = sectionMetaField(heading)
  const raw = doc.draft.fields[field]
  const value = typeof raw === 'string' ? raw : ''
  const limits = doc.limits?.metaDescription
  return (
    <div className="side-field">
      <div className="side-field-head">
        <label htmlFor={id} className="side-field-label">
          <code>{field}</code>
        </label>
        <span className="side-field-optional">optional</span>
      </div>
      <textarea
        id={id}
        className="editor-control editor-control--area"
        rows={3}
        value={value}
        disabled={doc.readOnly}
        aria-describedby={`${id}-note`}
        // A cleared description is removed, not saved as an empty string
        onChange={(event) => doc.onField(field, event.target.value || undefined)}
      />
      <p id={`${id}-note`} className="side-note">
        This section's own meta description, for a section with its own URL. Saved with the draft.
      </p>
      {limits && value !== '' && (
        <LengthMeter
          label="Length"
          length={value.length}
          state={metaLengthState(value.length, limits)}
          target={{ kind: 'range', min: limits.minChars, max: limits.maxChars }}
        />
      )}
    </div>
  )
}

/**
 * A section selected: designed or prose, the key a page template reads it
 * by, its word count, its own meta description, and for prose the hint
 */
export function SectionView({
  doc,
  heading,
  index,
}: {
  doc: PanelDocument
  heading: string
  index: number
}): ReactElement {
  const found = sectionAt(doc.draft.body, heading, index)
  if (!found) {
    return (
      <PanelCard>
        <PanelNote>This section is no longer in the body.</PanelNote>
      </PanelCard>
    )
  }
  const designed = isDesigned(heading, doc.info?.sections ?? [])
  const chip = <Chip tone={designed ? 'accent' : 'neutral'}>{designed ? 'designed' : 'prose'}</Chip>
  return (
    <PanelCard summary={chip}>
      <dl className="side-facts">
        <Fact label="Key">
          <code>{sectionKey(heading)}</code>
        </Fact>
        <Fact label="Words">{wordCount(found.section.markdown)}</Fact>
      </dl>
      {!designed && <PanelNote>{PROSE_HINT}</PanelNote>}
      {Object.hasOwn(doc.schema.schema.properties ?? {}, sectionMetaField(heading)) && (
        <SectionMeta doc={doc} heading={heading} />
      )}
    </PanelCard>
  )
}

/**
 * A section Live mode cannot tell apart: the page shows a heading the body has
 * more than once, outside the body's own render. Its key, and where to edit it.
 */
export function AmbiguousSectionView({
  doc,
  heading,
}: {
  doc: PanelDocument
  heading: string
}): ReactElement {
  const designed = isDesigned(heading, doc.info?.sections ?? [])
  const chip = <Chip tone={designed ? 'accent' : 'neutral'}>{designed ? 'designed' : 'prose'}</Chip>
  return (
    <PanelCard summary={chip}>
      <dl className="side-facts">
        <Fact label="Key">
          <code>{sectionKey(heading)}</code>
        </Fact>
        <Fact label="On the page">
          This heading appears more than once in the body: edit it in Structure mode.
        </Fact>
      </dl>
    </PanelCard>
  )
}

/** The lead selected: the body before its first `##` */
export function LeadView({ doc }: { doc: PanelDocument }): ReactElement {
  return (
    <PanelCard summary={<Chip>before first ##</Chip>}>
      <dl className="side-facts">
        <Fact label="Words">{wordCount(leadOf(doc.draft.body))}</Fact>
      </dl>
      <PanelNote>The markdown before the first ## heading.</PanelNote>
    </PanelCard>
  )
}
