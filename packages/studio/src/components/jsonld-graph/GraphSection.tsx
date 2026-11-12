import type { ReactNode } from 'react'

type SectionVariant = 'site' | 'page' | 'primary'

interface GraphSectionProps {
  label: string
  variant: SectionVariant
  children: ReactNode
}

/**
 * Section wrapper with a label and a visual variant. Used to group entity
 * cards into Site Context / Page / Primary Entity in the top-down layout.
 */
export function GraphSection({ label, variant, children }: GraphSectionProps): React.ReactElement {
  return (
    <section className={`graph-section graph-section--${variant}`}>
      <h3 className="graph-section-label">{label}</h3>
      <div className="graph-section-content">{children}</div>
    </section>
  )
}
