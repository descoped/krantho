import { AlertCircle, CheckCircle, Link2, X, XCircle } from 'lucide-react'
import {
  type PropertyClassification,
  type PropertyImportance,
  type PropertyState,
  shortenId,
} from '../../lib/jsonld-graph.js'
import { ArrayInput } from './inputs/ArrayInput.js'
import { DateInput } from './inputs/DateInput.js'
import { NumberInput } from './inputs/NumberInput.js'
import { ObjectArrayInput } from './inputs/ObjectArrayInput.js'
import { SelectInput } from './inputs/SelectInput.js'
import { TextareaInput } from './inputs/TextareaInput.js'
import { TextInput } from './inputs/TextInput.js'
import { UrlInput } from './inputs/UrlInput.js'
import './property-row.css'

interface PropertyRowProps {
  classification: PropertyClassification
  /** Called when a reference chip is clicked. Receives the target `@id`. */
  onFollowReference?: ((referenceId: string) => void) | undefined
  /** Edit mode: called when user changes a property value. */
  onValueChange?: ((property: string, value: unknown) => void) | undefined
  /** Edit mode: called when user removes a property. */
  onRemove?: ((property: string) => void) | undefined
}

/**
 * Single property row: label, value (or input in edit mode), validation badge,
 * and reference-chip handling.
 */
export function PropertyRow({
  classification,
  onFollowReference,
  onValueChange,
  onRemove,
}: PropertyRowProps): React.ReactElement {
  const { property, value, importance, state, isReference, referenceId, def } = classification
  const label = def?.label ?? property
  const badgeClass = badgeClassName(importance, state)
  const editing = onValueChange !== undefined

  return (
    <div className={`graph-property-row ${badgeClass}`}>
      <div className="graph-property-label-col">
        <ValidationBadge importance={importance} state={state} />
        <span className="graph-property-label">{label}</span>
      </div>
      <div className="graph-property-value">
        {isReference && referenceId !== undefined ? (
          <button
            type="button"
            className="graph-reference-link"
            onClick={() => onFollowReference?.(referenceId)}
            aria-label={`Follow reference to ${referenceId}`}
          >
            <Link2 size={12} />
            <span className="graph-reference-link-id">{shortenId(referenceId)}</span>
          </button>
        ) : editing ? (
          <div className="graph-property-input-row">
            <PropertyInput
              property={property}
              value={value}
              fieldType={def?.fieldType}
              hint={def?.hint}
              onChange={(v) => onValueChange(property, v)}
            />
            {onRemove && (
              <button
                type="button"
                className="graph-property-remove"
                onClick={() => onRemove(property)}
                aria-label={`Remove ${label}`}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <PropertyValue value={value} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PropertyInput — resolves fieldType to the correct input component
// ---------------------------------------------------------------------------

function PropertyInput({
  property,
  value,
  fieldType,
  hint,
  onChange,
}: {
  property: string
  value: unknown
  fieldType: string | undefined
  hint: string | undefined
  onChange: (value: unknown) => void
}): React.ReactElement {
  // Nested objects/arrays without a specific fieldType are not editable as text.
  // Render them as read-only JSON so the user sees the actual structure.
  if (fieldType !== 'array' && typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return (
        <span className="graph-property-value-array">
          Array ({value.length} item{value.length === 1 ? '' : 's'})
        </span>
      )
    }
    const obj = value as Record<string, unknown>
    const type = typeof obj['@type'] === 'string' ? obj['@type'] : null
    return (
      <span className="graph-property-value-object">
        {type ? `{${type}}` : JSON.stringify(value).slice(0, 80)}
      </span>
    )
  }

  const stringValue =
    typeof value === 'string' ? value : value !== null && value !== undefined ? String(value) : ''

  switch (fieldType) {
    case 'textarea':
      return <TextareaInput value={stringValue} onChange={onChange} label={property} />
    case 'url':
      return <UrlInput value={stringValue} onChange={onChange} label={property} />
    case 'date':
      return <DateInput value={stringValue} onChange={onChange} label={property} />
    case 'number':
      return (
        <NumberInput
          value={typeof value === 'number' ? value : stringValue}
          onChange={onChange}
          label={property}
        />
      )
    case 'select': {
      const options = hint
        ? hint
            .split('|')
            .map((o) => o.trim())
            .filter(Boolean)
        : []
      return (
        <SelectInput value={stringValue} onChange={onChange} options={options} label={property} />
      )
    }
    case 'array': {
      if (!Array.isArray(value)) return <TextInput value="" onChange={onChange} label={property} />
      const hasObjects = value.some((v) => typeof v === 'object' && v !== null)
      if (hasObjects) {
        return (
          <ObjectArrayInput
            value={value as Record<string, unknown>[]}
            onChange={onChange}
            label={property}
          />
        )
      }
      return (
        <ArrayInput
          value={value.map((v) => (typeof v === 'string' ? v : String(v)))}
          onChange={onChange}
          label={property}
        />
      )
    }
    case 'email':
      return (
        <input
          type="email"
          className="graph-input graph-input--email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={property}
        />
      )
    case 'tel':
      return (
        <input
          type="tel"
          className="graph-input graph-input--tel"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={property}
        />
      )
    default:
      return <TextInput value={stringValue} onChange={onChange} label={property} />
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function badgeClassName(importance: PropertyImportance, state: PropertyState): string {
  if (importance === 'required' && state === 'missing') {
    return 'graph-property-row--required-missing'
  }
  if (importance === 'recommended' && state === 'missing') {
    return 'graph-property-row--recommended-missing'
  }
  if (state === 'set' && importance === 'required') {
    return 'graph-property-row--required-set'
  }
  return ''
}

function ValidationBadge({
  importance,
  state,
}: {
  importance: PropertyImportance
  state: PropertyState
}): React.ReactElement | null {
  if (importance === 'required' && state === 'missing') {
    return (
      <XCircle
        size={14}
        className="graph-property-badge graph-property-badge--required-missing"
        aria-label="Missing required"
      />
    )
  }
  if (importance === 'recommended' && state === 'missing') {
    return (
      <AlertCircle
        size={14}
        className="graph-property-badge graph-property-badge--recommended-missing"
        aria-label="Missing recommended"
      />
    )
  }
  if (state === 'set' && importance === 'required') {
    return (
      <CheckCircle
        size={14}
        className="graph-property-badge graph-property-badge--set"
        aria-label="Set"
      />
    )
  }
  return <span className="graph-property-badge graph-property-badge--placeholder" aria-hidden />
}

function PropertyValue({ value }: { value: unknown }): React.ReactElement {
  if (value === undefined || value === null || value === '') {
    return <span className="graph-property-value-empty">—</span>
  }
  if (typeof value === 'string') {
    return <span className="graph-property-value-string">{truncate(value, 120)}</span>
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="graph-property-value-primitive">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    return (
      <span className="graph-property-value-array">
        Array ({value.length} item{value.length === 1 ? '' : 's'})
      </span>
    )
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const type = typeof obj['@type'] === 'string' ? obj['@type'] : 'object'
    return <span className="graph-property-value-object">{`{${type}}`}</span>
  }
  return <span className="graph-property-value-unknown">{String(value)}</span>
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}
