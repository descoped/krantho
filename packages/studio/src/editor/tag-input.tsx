import { X } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react'
import type { FieldInputProps } from './field-inputs.js'

function tagsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

function TagList({
  tags,
  onRemove,
}: {
  tags: readonly string[]
  onRemove: (index: number) => void
}): ReactElement | null {
  if (tags.length === 0) return null
  return (
    <ul className="editor-tags-list">
      {tags.map((tag, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a tag may repeat; its place in the list is its identity
        <li key={`${tag}-${index}`} className="editor-tag">
          {tag}
          <button
            type="button"
            className="editor-tag-remove"
            aria-label={`Remove ${tag}`}
            onClick={() => onRemove(index)}
          >
            <X aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A list of strings: each shown as a tag with Remove; Enter adds what was typed */
export function TagInput(props: FieldInputProps): ReactElement {
  const { id, name, value, describedBy, invalid, required, onChange } = props
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tags = tagsOf(value)
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter' || !typed.trim()) return
    event.preventDefault()
    onChange(name, [...tags, typed.trim()])
    setTyped('')
  }
  // The removed tag's button goes with it: focus moves to the input
  function remove(index: number): void {
    onChange(
      name,
      tags.filter((_, i) => i !== index),
    )
    inputRef.current?.focus()
  }

  return (
    <div className="editor-tags">
      <TagList tags={tags} onRemove={remove} />
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        className="editor-control"
        placeholder="Type and press Enter"
        value={typed}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
