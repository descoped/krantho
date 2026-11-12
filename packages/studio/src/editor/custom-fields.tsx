import { type ReactElement, useId } from 'react'
import { Button } from '../ui/button.js'

export interface CustomFieldsProps {
  idPrefix: string
  /** Fields the document holds that its collection's schema does not declare */
  entries: ReadonlyArray<[string, unknown]>
  onChange: (name: string, value: unknown) => void
  /** Add the field to the collection's runtime schema */
  onPromote: (name: string, value: unknown) => void
  /** The viewer may change the schema */
  canPromote: boolean
}

function shown(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function CustomField({
  props,
  name,
  value,
}: {
  props: CustomFieldsProps
  name: string
  value: unknown
}): ReactElement {
  const id = `${props.idPrefix}-custom-${name}`
  return (
    <div className="editor-field editor-custom-field">
      <div className="editor-field-head">
        <label className="editor-field-label" htmlFor={id}>
          {name}
        </label>
        <span className="editor-field-optional">custom</span>
      </div>
      <div className="editor-custom-line">
        <input
          id={id}
          type="text"
          className="editor-control"
          value={shown(value)}
          onChange={(event) => props.onChange(name, event.target.value)}
        />
        {props.canPromote && (
          <Button
            size="sm"
            aria-label={`Promote ${name} to a schema field`}
            onClick={() => props.onPromote(name, value)}
          >
            Promote
          </Button>
        )}
      </div>
    </div>
  )
}

/** Fields outside the schema, each editable as text, with Promote to make it a schema field */
export function CustomFields(props: CustomFieldsProps): ReactElement | null {
  const headingId = useId()
  if (props.entries.length === 0) return null
  return (
    <section className="editor-custom-fields" aria-labelledby={headingId}>
      <h2 id={headingId} className="editor-subtitle">
        Custom fields
      </h2>
      <p className="editor-note">
        Not in the collection's schema.
        {props.canPromote && ' Promote one to add it to the schema.'}
      </p>
      {props.entries.map(([name, value]) => (
        <CustomField key={name} props={props} name={name} value={value} />
      ))}
    </section>
  )
}
