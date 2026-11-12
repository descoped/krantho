import { type ReactElement, type ReactNode, useId } from 'react'

export interface PanelCardProps {
  /** The card's heading; a card about the panel's selection has none, the panel's heading names it */
  title?: string | undefined
  /** A summary beside the title: a chip */
  summary?: ReactNode | undefined
  children: ReactNode
}

/** One of the side panel's cards: a calm surface with a hairline border, its title and summary */
export function PanelCard({ title, summary, children }: PanelCardProps): ReactElement {
  const id = useId()
  if (title === undefined) {
    return (
      <div className="side-card">
        {summary && <div className="side-card-head">{summary}</div>}
        {children}
      </div>
    )
  }
  return (
    <section className="side-card" aria-labelledby={id}>
      <div className="side-card-head">
        <h3 id={id} className="side-card-title">
          {title}
        </h3>
        {summary}
      </div>
      {children}
    </section>
  )
}

/** A fact the panel states: its label and value, in a definition list */
export function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="side-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A quiet line of explanation under a fact or a list */
export function PanelNote({ children }: { children: ReactNode }): ReactElement {
  return <p className="side-note">{children}</p>
}
