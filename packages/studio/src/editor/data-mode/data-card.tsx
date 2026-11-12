import { type ReactElement, type ReactNode, useId } from 'react'

export interface DataCardProps {
  title: string
  /** A quiet line after the title: where the card's data comes from */
  lead?: ReactNode | undefined
  /** Beside the title: a chip, or an action */
  aside?: ReactNode | undefined
  children: ReactNode
}

/** One of Data mode's cards: a region named by its heading, on a hairline surface */
export function DataCard({ title, lead, aside, children }: DataCardProps): ReactElement {
  const id = useId()
  return (
    <section className="data-card" aria-labelledby={id}>
      <div className="data-card-head">
        <h2 id={id} className="data-card-title">
          {title}
        </h2>
        {aside && <div className="data-card-aside">{aside}</div>}
      </div>
      {lead && <p className="data-card-lead">{lead}</p>}
      {children}
    </section>
  )
}

/** A short state in place of a card's content: loading, off, not saved, could not be read */
export function DataNote({
  children,
  tone,
}: {
  children: ReactNode
  tone?: 'error' | undefined
}): ReactElement {
  return <p className={tone === 'error' ? 'data-note data-note--error' : 'data-note'}>{children}</p>
}

/** A failure of something the person just did: announced at once (`role="alert"`) */
export function DataAlert({ children }: { children: ReactNode }): ReactElement {
  return (
    <p role="alert" className="data-note data-note--error">
      {children}
    </p>
  )
}
