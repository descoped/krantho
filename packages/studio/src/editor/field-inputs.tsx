import type { ReactElement } from 'react'
import type { JsonSchemaProperty } from '../lib/api-types.js'
import { formatTimestamp } from '../lib/format.js'
import { type FieldKind, inputType } from './field-model.js'
import { MediaField } from './media-field.js'
import { ReferenceInput } from './reference-input.js'
import { TagInput } from './tag-input.js'
import { localInputToUtc, utcToLocalInput } from './utc-datetime.js'
import './field-inputs.css'

/** What every field input receives from its row */
export interface FieldInputProps {
  /** The input's id, which the row's label points at */
  id: string
  /** The row label's id, for a control that is a group rather than one input */
  labelId: string
  name: string
  property: JsonSchemaProperty
  value: unknown
  required: boolean
  /** The ids of the help text and the error, when shown */
  describedBy: string | undefined
  invalid: boolean
  onChange: (name: string, value: unknown) => void
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The attributes every native input shares */
interface CommonAttributes {
  id: string
  name: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  'aria-required': true | undefined
}

function common(props: FieldInputProps): CommonAttributes {
  return {
    id: props.id,
    name: props.name,
    'aria-describedby': props.describedBy,
    'aria-invalid': props.invalid || undefined,
    'aria-required': props.required || undefined,
  }
}

function TextField(props: FieldInputProps): ReactElement {
  const { name, property, value, onChange } = props
  return (
    <input
      {...common(props)}
      type={inputType(property, name)}
      className="editor-control"
      value={text(value)}
      maxLength={property.maxLength}
      pattern={property.pattern}
      onChange={(event) => onChange(name, event.target.value)}
    />
  )
}

function TextareaField(props: FieldInputProps): ReactElement {
  const { id, name, property, value, onChange } = props
  const length = text(value).length
  const counted = property.maxLength !== undefined
  const counterId = `${id}-count`
  const describedBy = [props.describedBy, counted ? counterId : null].filter(Boolean).join(' ')
  return (
    <>
      <textarea
        {...common(props)}
        aria-describedby={describedBy || undefined}
        className="editor-control editor-control--area"
        value={text(value)}
        rows={3}
        maxLength={property.maxLength}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {counted && (
        <span id={counterId} className="editor-field-counter">
          {length} of {property.maxLength} characters
        </span>
      )}
    </>
  )
}

function NumberField(props: FieldInputProps): ReactElement {
  const { name, property, value, onChange } = props
  return (
    <input
      {...common(props)}
      type="number"
      className="editor-control editor-control--short"
      value={typeof value === 'number' && !Number.isNaN(value) ? value : ''}
      min={property.minimum}
      max={property.maximum}
      onChange={(event) =>
        // A cleared number is left out of the save, which replaces every field,
        // so the value is removed; the schemas accept an absent number, not null
        onChange(name, event.target.value === '' ? undefined : event.target.valueAsNumber)
      }
    />
  )
}

function BooleanField(props: FieldInputProps): ReactElement {
  const { name, value, onChange } = props
  return (
    <input
      {...common(props)}
      type="checkbox"
      className="editor-checkbox"
      checked={value === true}
      onChange={(event) => onChange(name, event.target.checked)}
    />
  )
}

function EnumField(props: FieldInputProps): ReactElement {
  const { name, property, value, onChange } = props
  return (
    <select
      {...common(props)}
      className="editor-control editor-control--short"
      value={text(value)}
      onChange={(event) => onChange(name, event.target.value)}
    >
      <option value="">Choose…</option>
      {property.enum?.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

function ColorField(props: FieldInputProps): ReactElement {
  const { name, value, onChange } = props
  return (
    <span className="editor-color">
      <input
        type="color"
        className="editor-color-swatch"
        aria-label={`${name}, colour picker`}
        value={text(value)}
        onChange={(event) => onChange(name, event.target.value)}
      />
      <input
        {...common(props)}
        type="text"
        className="editor-control editor-control--short"
        value={text(value)}
        placeholder="#rrggbb"
        onChange={(event) => onChange(name, event.target.value)}
      />
    </span>
  )
}

function DateField(props: FieldInputProps): ReactElement {
  const { name, property, value, onChange } = props
  const type = inputType(property, name)
  const moment = type === 'datetime-local'
  const input = (
    <input
      {...common(props)}
      type={type}
      className="editor-control editor-control--short"
      value={moment ? utcToLocalInput(value) : text(value).slice(0, 10)}
      onChange={(event) => {
        const next = event.target.value
        onChange(name, moment ? localInputToUtc(next) : next)
      }}
    />
  )
  if (!moment) return input
  return (
    <span className="editor-timestamp">
      {input}
      <small className="editor-timestamp-shown">{formatTimestamp(value)}</small>
    </span>
  )
}

/** The input for each kind of field */
export const FIELD_INPUTS: Readonly<Record<FieldKind, (props: FieldInputProps) => ReactElement>> = {
  media: MediaField,
  reference: ReferenceInput,
  enum: EnumField,
  boolean: BooleanField,
  number: NumberField,
  tags: TagInput,
  textarea: TextareaField,
  color: ColorField,
  date: DateField,
  text: TextField,
}
