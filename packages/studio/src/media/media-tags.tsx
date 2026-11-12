import { X } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, useId, useRef, useState } from 'react'

export interface MediaTagsProps {
  tags: readonly string[]
  /** Tags other files carry, offered as the input's suggestions */
  known: readonly string[]
  disabled: boolean
  onChange: (tags: string[]) => void
}

/** The tags, each with Remove */
function TagList({
  tags,
  disabled,
  onRemove,
}: {
  tags: readonly string[]
  disabled: boolean
  onRemove: (tag: string) => void
}): ReactElement | null {
  if (tags.length === 0) return null
  return (
    <ul className="media-tags">
      {tags.map((tag) => (
        <li key={tag} className="media-tag">
          {tag}
          <button
            type="button"
            className="media-tag-remove"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
            onClick={() => onRemove(tag)}
          >
            <X aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The tags other files carry and this one does not, offered as the input types */
function Suggestions({
  id,
  known,
  tags,
}: {
  id: string
  known: readonly string[]
  tags: readonly string[]
}): ReactElement {
  return (
    <datalist id={id}>
      {known
        .filter((tag) => !tags.includes(tag))
        .map((tag) => (
          <option key={tag} value={tag} />
        ))}
    </datalist>
  )
}

/** A file's tags: each with Remove; Enter or a comma adds what was typed */
export function MediaTags({ tags, known, disabled, onChange }: MediaTagsProps): ReactElement {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  function add(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    const tag = typed.trim()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setTyped('')
  }
  function remove(tag: string): void {
    onChange(tags.filter((t) => t !== tag))
    input.current?.focus()
  }
  return (
    <div className="media-field">
      <label htmlFor={id} className="media-label">
        Tags
      </label>
      <TagList tags={tags} disabled={disabled} onRemove={remove} />
      <input
        ref={input}
        id={id}
        className="media-input"
        list={`${id}-known`}
        placeholder="Type a tag and press Enter"
        value={typed}
        disabled={disabled}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={add}
      />
      <Suggestions id={`${id}-known`} known={known} tags={tags} />
    </div>
  )
}
