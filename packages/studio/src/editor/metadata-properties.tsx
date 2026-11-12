import { RotateCcw } from 'lucide-react'
import { type ReactElement, useId, useState } from 'react'
import type { JsonSchemaProperty } from '../lib/api-types.js'
import { Button, IconButton } from '../ui/button.js'
import { FIELD_INPUTS } from './field-inputs.js'
import { fieldHelp, fieldKind, SYSTEM_FIELDS } from './field-model.js'
import './metadata-editor.css'

export function propertyLabel(name: string, property: JsonSchemaProperty): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
  return property.title ?? words.charAt(0).toUpperCase() + words.slice(1)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export interface ValueProps {
  name: string
  path: string
  property: JsonSchemaProperty
  value: unknown
  required: boolean
  errors: Readonly<Record<string, string>>
  onValue: (value: unknown) => void
  sources?: Readonly<Record<string, string>> | undefined
}

/** Object and array controls follow the declared structure, never a JSON textarea. */
export function StructuredValue(props: ValueProps): ReactElement {
  const { property, value, onValue } = props
  const label = propertyLabel(props.name, property)
  const alternatives = property.anyOf ?? property.oneOf
  if (alternatives?.some((option) => option.type === 'null')) {
    const concrete = alternatives.find((option) => option.type !== 'null') ?? {}
    return (
      <div className="metadata-property">
        {value === null ? (
          <>
            <p>{label}: No value</p>
            <Button
              size="sm"
              onClick={() =>
                onValue(
                  concrete.default ??
                    (concrete.type === 'object'
                      ? {}
                      : concrete.type === 'array'
                        ? []
                        : concrete.type === 'boolean'
                          ? false
                          : concrete.type === 'number'
                            ? 0
                            : ''),
                )
              }
            >
              Set {label.toLowerCase()}
            </Button>
          </>
        ) : (
          <StructuredValue
            {...props}
            property={{ ...property, ...concrete, anyOf: undefined, oneOf: undefined }}
          />
        )}
        {value !== null && (
          <Button variant="ghost" size="sm" onClick={() => onValue(null)}>
            Use no value
          </Button>
        )}
      </div>
    )
  }
  if (property.type === 'object')
    return (
      <fieldset className="metadata-object">
        <legend>{label}</legend>
        <StructuredProperties
          property={property}
          values={record(value)}
          path={props.path}
          errors={props.errors}
          sources={props.sources}
          onValues={onValue}
        />
      </fieldset>
    )
  if (property.type === 'array' && property.items?.type !== 'string') {
    const items = Array.isArray(value) ? value : []
    return (
      <fieldset className="metadata-array">
        <legend>{label}</legend>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Items have no persistent IDs; values are controlled by their schema index.
          <div className="metadata-array-item" key={`${props.path}.${index}`}>
            <StructuredValue
              {...props}
              name={`${label} ${index + 1}`}
              path={`${props.path}.${index}`}
              property={property.items ?? {}}
              value={item}
              onValue={(next) => onValue(items.map((entry, i) => (i === index ? next : entry)))}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onValue(items.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onValue([...items, property.items?.type === 'object' ? {} : ''])}
        >
          Add item
        </Button>
      </fieldset>
    )
  }
  return <PrimitiveValue {...props} />
}

function PrimitiveValue(props: ValueProps): ReactElement {
  const id = useId()
  const label = propertyLabel(props.name, props.property)
  const help = fieldHelp(props.property)
  const error =
    props.errors[props.path] ??
    (props.path.startsWith('fields.') ? props.errors[props.path.slice(7)] : undefined)
  const Input = FIELD_INPUTS[fieldKind(props.property, props.name)]
  const described =
    [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="metadata-property">
      <div className="metadata-label-row">
        <label id={`${id}-label`} htmlFor={id}>
          {label}
          {props.required && <span aria-hidden="true"> *</span>}
        </label>
        {!props.required && props.value !== undefined && props.property.type !== 'boolean' && (
          <IconButton
            icon={RotateCcw}
            size="sm"
            label={`Reset ${label.toLowerCase()}`}
            onClick={() => props.onValue(undefined)}
          />
        )}
      </div>
      {props.property.type === 'boolean' && !props.required ? (
        <select
          id={id}
          className="editor-control"
          aria-describedby={described}
          aria-invalid={Boolean(error) || undefined}
          value={props.value === undefined ? '' : String(props.value)}
          onChange={(event) =>
            props.onValue(event.target.value === '' ? undefined : event.target.value === 'true')
          }
        >
          <option value="">Use default</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <Input
          id={id}
          labelId={`${id}-label`}
          name={props.path}
          property={props.property}
          value={props.value}
          required={props.required}
          describedBy={described}
          invalid={Boolean(error)}
          onChange={(_name, value) => props.onValue(value)}
        />
      )}
      {props.sources?.[props.path] && (
        <p className="metadata-source">Copied from {props.sources[props.path]}</p>
      )}
      {help && (
        <p id={`${id}-help`} className="metadata-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function StructuredProperties(props: {
  property: JsonSchemaProperty
  values: Record<string, unknown>
  path: string
  errors: Readonly<Record<string, string>>
  onValues: (values: Record<string, unknown>) => void
  sources?: Readonly<Record<string, string>> | undefined
}): ReactElement {
  const required = new Set(props.property.required ?? [])
  const properties = props.property.properties ?? {}
  const additional = props.property.additionalProperties
  const allowsAdditional = additional !== undefined && additional !== false
  return (
    <>
      {Object.entries(properties)
        .filter(([name]) => props.path !== 'fields' || !SYSTEM_FIELDS.has(name))
        .map(([name, property]) => (
          <StructuredValue
            key={name}
            name={name}
            path={`${props.path}.${name}`}
            property={property}
            value={props.values[name]}
            required={required.has(name)}
            errors={props.errors}
            sources={props.sources}
            onValue={(value) => {
              const next = { ...props.values }
              if (value === undefined) delete next[name]
              else next[name] = value
              props.onValues(next)
            }}
          />
        ))}
      {allowsAdditional && (
        <RecordProperties
          {...props}
          properties={properties}
          additional={typeof additional === 'object' ? additional : {}}
        />
      )}
      {!allowsAdditional &&
        Object.entries(props.values)
          .filter(([name]) => !Object.hasOwn(properties, name))
          .map(([name, value]) => (
            <div key={name} className="metadata-property">
              <p>
                {propertyLabel(name, {})}:{' '}
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </p>
              <p>
                This property is outside the current content form. Review it before removing it.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = { ...props.values }
                  delete next[name]
                  props.onValues(next)
                }}
              >
                Remove {propertyLabel(name, {})}
              </Button>
            </div>
          ))}
    </>
  )
}

function inferredProperty(value: unknown): JsonSchemaProperty {
  if (Array.isArray(value)) return { type: 'array', items: inferredProperty(value[0]) }
  if (value !== null && typeof value === 'object')
    return { type: 'object', additionalProperties: true }
  return {
    type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
  }
}

function RecordProperties(props: {
  properties: Record<string, JsonSchemaProperty>
  additional: JsonSchemaProperty
  values: Record<string, unknown>
  path: string
  errors: Readonly<Record<string, string>>
  onValues: (values: Record<string, unknown>) => void
  sources?: Readonly<Record<string, string>> | undefined
}): ReactElement {
  const [name, setName] = useState('')
  const id = useId()
  return (
    <div className="metadata-record">
      {Object.entries(props.values)
        .filter(([key]) => !Object.hasOwn(props.properties, key))
        .map(([key, value]) => (
          <StructuredValue
            key={key}
            name={key}
            path={`${props.path}.${key}`}
            value={value}
            property={props.additional.type ? props.additional : inferredProperty(value)}
            required={false}
            errors={props.errors}
            sources={props.sources}
            onValue={(nextValue) => {
              const next = { ...props.values }
              if (nextValue === undefined) delete next[key]
              else next[key] = nextValue
              props.onValues(next)
            }}
          />
        ))}
      <label htmlFor={id}>New property name</label>
      <input id={id} value={name} onChange={(event) => setName(event.target.value)} />
      <Button
        size="sm"
        disabled={
          !name.trim() ||
          Object.hasOwn(props.values, name.trim()) ||
          ['__proto__', 'constructor', 'prototype'].includes(name.trim())
        }
        onClick={() => {
          props.onValues({ ...props.values, [name.trim()]: props.additional.default ?? '' })
          setName('')
        }}
      >
        Add property
      </Button>
    </div>
  )
}
