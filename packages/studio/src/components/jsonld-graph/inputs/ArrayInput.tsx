import { Plus, X } from 'lucide-react'

interface ArrayInputProps {
  value: readonly string[]
  onChange: (value: string[]) => void
  label?: string | undefined
  placeholder?: string | undefined
}

/**
 * Manages an array of string values with add/remove. For simple
 * string arrays (e.g. sameAs URLs, keywords). Sub-entity arrays
 * are handled by SubEntityEditor.
 */
export function ArrayInput({
  value,
  onChange,
  label,
  placeholder,
}: ArrayInputProps): React.ReactElement {
  const items = [...value]

  const handleAdd = (): void => {
    onChange([...items, ''])
  }

  const handleChange = (index: number, newValue: string): void => {
    const next = [...items]
    next[index] = newValue
    onChange(next)
  }

  const handleRemove = (index: number): void => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border and layout
    <div className="graph-input graph-input--array" role="group" aria-label={label}>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: strings have no identity; a value key would remount the input on every keystroke
        <div key={i} className="graph-input-array-item">
          <input
            type="text"
            className="graph-input graph-input--text"
            value={item}
            onChange={(e) => handleChange(i, e.target.value)}
            placeholder={placeholder}
          />
          <button
            type="button"
            className="graph-input-array-remove"
            onClick={() => handleRemove(i)}
            aria-label="Remove item"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="graph-input-array-add" onClick={handleAdd}>
        <Plus size={14} /> Add item
      </button>
    </div>
  )
}
