import { CircleCheck, Plus } from 'lucide-react'
import { type ReactElement, useMemo } from 'react'
import { Chip } from '../../ui/chip.js'
import {
  addDesignedSection,
  type DesignedSection,
  type PageSections,
  pageSections,
  type SectionRef,
} from './page-sections.js'
import { PanelCard, PanelNote } from './panel-card.js'
import type { PanelDocument } from './panel-document.js'
import type { PanelSelection } from './selection.js'

const NO_SECTIONS: readonly string[] = []

interface CardProps {
  doc: PanelDocument
  /** Show a part of the body in the panel; the panel's heading takes focus */
  onSelect: (selection: PanelSelection) => void
}

/** A designed section the body has: opens it in the panel */
function PresentRow({
  found,
  onSelect,
}: {
  found: SectionRef
  onSelect: CardProps['onSelect']
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        className="side-row"
        onClick={() => onSelect({ kind: 'section', ...found })}
      >
        <span className="side-row-name">{found.heading}</span>{' '}
        <span className="side-row-state">
          <CircleCheck className="side-row-icon side-row-icon--present" aria-hidden="true" />
          present
        </span>
      </button>
    </li>
  )
}

/** A designed section the body lacks: a dashed row whose visible text names it and says Add section */
function MissingRow({
  name,
  readOnly,
  onAdd,
}: {
  name: string
  readOnly: boolean
  onAdd: (name: string) => void
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        className="side-row side-row--missing"
        disabled={readOnly}
        onClick={() => onAdd(name)}
      >
        <span className="side-row-name">{name}</span>{' '}
        <span className="side-row-state">
          <Plus className="side-row-icon" aria-hidden="true" />
          Add section
        </span>
      </button>
    </li>
  )
}

/** A designed section: present opens it, missing (a dashed row) adds it to the body */
function DesignedRow({
  row,
  readOnly,
  onSelect,
  onAdd,
}: {
  row: DesignedSection
  readOnly: boolean
  onSelect: CardProps['onSelect']
  onAdd: (name: string) => void
}): ReactElement {
  if (row.found) return <PresentRow found={row.found} onSelect={onSelect} />
  return <MissingRow name={row.name} readOnly={readOnly} onAdd={onAdd} />
}

/** A part of the body the contract does not design: the lead, or a prose section */
function PlainRow({
  name,
  state,
  onClick,
}: {
  name: string
  state: string
  onClick: () => void
}): ReactElement {
  return (
    <li>
      <button type="button" className="side-row" onClick={onClick}>
        <span className="side-row-name">{name}</span>{' '}
        <span className="side-row-state">{state}</span>
      </button>
    </li>
  )
}

/** The lead, the designed sections present or missing, then the prose sections */
function SectionRows({
  parts,
  readOnly,
  onSelect,
  onAdd,
}: {
  parts: PageSections
  readOnly: boolean
  onSelect: CardProps['onSelect']
  onAdd: (name: string) => void
}): ReactElement {
  return (
    <ul className="side-rows" aria-label="Sections">
      {parts.lead !== '' && (
        <PlainRow name="Lead" state="before first ##" onClick={() => onSelect({ kind: 'lead' })} />
      )}
      {parts.designed.map((row) => (
        <DesignedRow
          key={row.name}
          row={row}
          readOnly={readOnly}
          onSelect={onSelect}
          onAdd={onAdd}
        />
      ))}
      {parts.prose.map((section) => (
        <PlainRow
          key={`${section.index}-${section.heading}`}
          name={section.heading}
          state="prose"
          onClick={() => onSelect({ kind: 'section', ...section })}
        />
      ))}
    </ul>
  )
}

/**
 * Page & sections: the designed sections of the collection's page template,
 * present or missing, then the body's other sections, which render as prose.
 * The page template is not named: the API does not report it. Structure mode
 * shows it; Live mode has the page itself.
 */
export function PageSectionsCard({ doc, onSelect }: CardProps): ReactElement {
  const designed = doc.info?.sections ?? NO_SECTIONS
  const { body } = doc.draft
  const parts = useMemo(() => pageSections(body, designed), [body, designed])
  function add(name: string): void {
    const added = addDesignedSection(body, designed, name)
    doc.onBody(added.body)
    onSelect({ kind: 'section', heading: name, index: added.index })
  }
  const chip = <Chip tone="accent">{`${parts.present} / ${designed.length} designed`}</Chip>
  return (
    <PanelCard title="Page & sections" summary={chip}>
      {designed.length === 0 && (
        <PanelNote>The page template designs no sections, so each renders as prose.</PanelNote>
      )}
      <SectionRows parts={parts} readOnly={doc.readOnly} onSelect={onSelect} onAdd={add} />
    </PanelCard>
  )
}
