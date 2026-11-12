import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'

interface ObjectArrayInputProps {
  value: readonly Record<string, unknown>[]
  onChange: (value: Record<string, unknown>[]) => void
  label?: string | undefined
}

/**
 * Editor for arrays of objects (e.g. BreadcrumbList itemListElement).
 * All items are visible — each row shows its editable properties inline.
 */
export function ObjectArrayInput({
  value,
  onChange,
  label,
}: ObjectArrayInputProps): React.ReactElement {
  const fieldId = useId()
  const handlePropertyChange = (index: number, property: string, newValue: unknown): void => {
    const next = value.map((item, i) => (i === index ? { ...item, [property]: newValue } : item))
    onChange(next as Record<string, unknown>[])
  }

  const handleRemove = (index: number): void => {
    onChange(value.filter((_, i) => i !== index) as Record<string, unknown>[])
  }

  const handleAdd = (): void => {
    // Derive @type and property keys from existing items
    const template: Record<string, unknown> = {}
    const first = value[0]
    if (first) {
      for (const [key, val] of Object.entries(first)) {
        if (key === '@type') {
          template['@type'] = val
        } else if (typeof val === 'number') {
          template[key] = Math.max(...value.map((v) => Number(v[key]) || 0)) + 1
        } else {
          template[key] = ''
        }
      }
    }
    onChange([...(value as Record<string, unknown>[]), template])
  }

  // Collect all editable property keys (exclude @type)
  const propertyKeys = new Set<string>()
  for (const item of value) {
    for (const key of Object.keys(item)) {
      if (key !== '@type') propertyKeys.add(key)
    }
  }
  const keys = [...propertyKeys]

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border and layout
    <div className="graph-input graph-input--object-array" role="group" aria-label={label}>
      {value.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows are edited in place, so no property is a stable identity
        <div key={i} className="graph-object-array-item">
          <span className="graph-object-array-item-index">{i + 1}.</span>
          <div className="graph-object-array-item-fields">
            {keys.map((key) => {
              const val = item[key]
              const inputId = `${fieldId}-${i}-${key}`
              return (
                <div key={key} className="graph-object-array-field">
                  <label htmlFor={inputId} className="graph-object-array-field-label">
                    {key}
                  </label>
                  {typeof val === 'string' || typeof val === 'number' || val === undefined ? (
                    <input
                      id={inputId}
                      type="text"
                      className="graph-input graph-input--text"
                      value={val !== undefined ? String(val) : ''}
                      onChange={(e) => {
                        const newVal =
                          typeof val === 'number'
                            ? Number(e.target.value) || e.target.value
                            : e.target.value
                        handlePropertyChange(i, key, newVal)
                      }}
                      placeholder={key}
                    />
                  ) : (
                    <span id={inputId} className="graph-property-value-object">
                      {JSON.stringify(val).slice(0, 60)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="graph-object-array-item-remove"
            onClick={() => handleRemove(i)}
            aria-label={`Remove item ${i + 1}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="graph-input-array-add" onClick={handleAdd}>
        <Plus size={14} /> Add item
      </button>
    </div>
  )
}
