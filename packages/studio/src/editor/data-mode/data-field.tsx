import type { ReactElement, ReactNode } from 'react'

/**
 * A field Data mode edits in the draft: its name as the label (in the code
 * face, as Structure mode shows field names), the control, and help that the
 * control is described by (`<id>-help`)
 */
export function DataField({
  id,
  label,
  help,
  children,
}: {
  id: string
  label: string
  help?: ReactNode | undefined
  children: ReactNode
}): ReactElement {
  return (
    <div className="data-field">
      <label htmlFor={id} className="data-field-label">
        {label}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="data-field-help">
          {help}
        </p>
      )}
    </div>
  )
}

/** A field's text value; anything else reads as empty */
export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
