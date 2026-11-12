import { ScanSearch } from 'lucide-react'
import type { ReactElement } from 'react'
import type { JsonSchemaProperty } from '../lib/api-types.js'
import { chipClass } from '../ui/chip.js'
import { FIELD_INPUTS } from './field-inputs.js'
import { fieldHelp, fieldKind, typePill } from './field-model.js'
import { StructuredValue } from './metadata-editor.js'

export interface FieldRowProps {
  /** A prefix that makes the ids on this screen unique */
  idPrefix: string
  name: string
  property: JsonSchemaProperty
  value: unknown
  required: boolean
  /** Which SEO outputs read the field; null when none does or SEO is off */
  seoUse: string | null
  error: string | undefined
  onChange: (name: string, value: unknown) => void
}

/** A field's type, and which SEO outputs read it */
function FieldPills({ pill, seoUse }: { pill: string; seoUse: string | null }): ReactElement {
  return (
    <>
      <span className={chipClass('neutral', 'editor-field-pill')}>
        <span className="visually-hidden">type </span>
        {pill}
      </span>
      {seoUse && (
        <span className={chipClass('accent', 'editor-field-pill')}>
          <ScanSearch className="ui-chip-icon" aria-hidden="true" />
          <span className="visually-hidden">used for search as </span>
          {seoUse}
        </span>
      )}
    </>
  )
}

/** The line above a field: its label, required or optional, its type and its SEO use */
function FieldHead({
  id,
  labelId,
  name,
  required,
  pill,
  seoUse,
  isGroup,
}: {
  id: string
  labelId: string
  name: string
  required: boolean
  pill: string
  seoUse: string | null
  isGroup: boolean
}): ReactElement {
  const Label = isGroup ? 'span' : 'label'
  return (
    <div className="editor-field-head">
      <Label id={labelId} className="editor-field-label" {...(isGroup ? {} : { htmlFor: id })}>
        {name}
        {required && (
          <span className="editor-field-required" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {!required && <span className="editor-field-optional">optional</span>}
      <FieldPills pill={pill} seoUse={seoUse} />
    </div>
  )
}

/** The ids of a field's help text and error, for its input's description */
function describedBy(
  id: string,
  help: string | null,
  error: string | undefined,
): string | undefined {
  const ids = [help ? `${id}-help` : null, error ? `${id}-error` : null]
  return ids.filter(Boolean).join(' ') || undefined
}

/** The help text under a field, and the error a refused save gave it */
function FieldNotes({
  id,
  help,
  error,
}: {
  id: string
  help: string | null
  error: string | undefined
}): ReactElement {
  return (
    <>
      {help && (
        <p id={`${id}-help`} className="editor-field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="editor-field-error">
          {error}
        </p>
      )}
    </>
  )
}

/** One schema field in Structure mode: its head line, its input, the help text and any error */
export function FieldRow(props: FieldRowProps): ReactElement {
  if (
    props.property.type === 'object' ||
    (props.property.type === 'array' && props.property.items?.type !== 'string')
  ) {
    return (
      <StructuredValue
        name={props.name}
        path={`fields.${props.name}`}
        property={props.property}
        value={props.value}
        required={props.required}
        errors={props.error ? { [`fields.${props.name}`]: props.error } : {}}
        onValue={(value) => props.onChange(props.name, value)}
      />
    )
  }
  const { idPrefix, name, property, value, required, seoUse, error, onChange } = props
  const kind = fieldKind(property, name)
  const Input = FIELD_INPUTS[kind]
  const id = `${idPrefix}-${name}`
  const labelId = `${id}-label`
  const help = fieldHelp(property)
  return (
    <div
      className={error ? 'editor-field editor-field--invalid' : 'editor-field'}
      data-field={name}
    >
      <FieldHead
        id={id}
        labelId={labelId}
        name={name}
        required={required}
        pill={typePill(property, name)}
        seoUse={seoUse}
        isGroup={kind === 'media'}
      />
      <Input
        id={id}
        labelId={labelId}
        name={name}
        property={property}
        value={value}
        required={required}
        describedBy={describedBy(id, help, error)}
        invalid={error !== undefined}
        onChange={onChange}
      />
      <FieldNotes id={id} help={help} error={error} />
    </div>
  )
}
