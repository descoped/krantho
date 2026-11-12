import { type ReactElement, useEffect, useState } from 'react'
import { fetchCollectionItems } from '../lib/api.js'
import type { FieldInputProps } from './field-inputs.js'
import { referenceTarget } from './field-model.js'

interface Option {
  slug: string
  label: string
}

/** The documents a reference can point at; null while they load */
function useOptions(collection: string): Option[] | null {
  const [options, setOptions] = useState<Option[] | null>(null)
  useEffect(() => {
    let active = true
    fetchCollectionItems(collection)
      .then(({ items }) => {
        if (!active) return
        setOptions(
          items.map(({ meta, fields }) => ({
            slug: meta.slug,
            label: typeof fields.title === 'string' ? fields.title : meta.slug,
          })),
        )
      })
      .catch(() => {
        if (active) setOptions([])
      })
    return () => {
      active = false
    }
  }, [collection])
  return options
}

/** A reference field: a document of the target collection, by slug */
export function ReferenceInput(props: FieldInputProps): ReactElement {
  const { id, name, property, value, describedBy, invalid, required, onChange } = props
  const target = referenceTarget(property) ?? ''
  const options = useOptions(target)
  const current = typeof value === 'string' ? value : ''
  // A slug the list does not hold stays selectable, so opening the editor never loses it
  const missing = current !== '' && options !== null && !options.some((o) => o.slug === current)
  return (
    <select
      id={id}
      name={name}
      className="editor-control editor-control--short"
      value={current}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      aria-busy={options === null || undefined}
      onChange={(event) => onChange(name, event.target.value)}
    >
      <option value="">{options === null ? 'Loading…' : `Choose from ${target}…`}</option>
      {missing && <option value={current}>{current}</option>}
      {options?.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
