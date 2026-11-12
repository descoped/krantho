import { type ReactElement, type ReactNode, useId } from 'react'
import { Chip } from '../ui/chip.js'

export interface StructureCardProps {
  title: string
  /** A quiet line under the title: where the card's data comes from */
  lead?: ReactNode | undefined
  /** Beside the title: a chip, or an action */
  aside?: ReactNode | undefined
  /** The section an anchor links to */
  id?: string | undefined
  children?: ReactNode | undefined
}

/** One of Structure's cards: a region named by its heading, on a hairline surface */
export function StructureCard({
  title,
  lead,
  aside,
  id,
  children,
}: StructureCardProps): ReactElement {
  const titleId = useId()
  return (
    <section id={id} className="structure-card" aria-labelledby={titleId}>
      <div className="structure-card-head">
        <h3 id={titleId} className="structure-card-title">
          {title}
        </h3>
        {aside}
      </div>
      {lead && <p className="structure-note">{lead}</p>}
      {children}
    </section>
  )
}

/** Schema.org types as chips; says so when there are none */
export function TypeChips({ types }: { types: readonly string[] }): ReactElement {
  if (types.length === 0) return <span className="structure-muted">None set</span>
  return (
    <span className="structure-chips">
      {types.map((type) => (
        <Chip key={type}>{type}</Chip>
      ))}
    </span>
  )
}
