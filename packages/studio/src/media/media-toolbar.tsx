import { ListChecks, Search } from 'lucide-react'
import { type ReactElement, useId } from 'react'
import { Button } from '../ui/button.js'
import { SORT_LABELS, SORT_OPTIONS, type SortOption } from './media-model.js'
import type { MediaFilters } from './use-media-library.js'

export interface MediaToolbarProps {
  filters: MediaFilters
  onFilters: (change: Partial<MediaFilters>) => void
  /** Every tag the library's files carry, from the API */
  tags: readonly string[]
  sort: SortOption
  onSort: (sort: SortOption) => void
  bulk: boolean
  onBulk: () => void
}

function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}): ReactElement {
  const id = useId()
  return (
    <span className="media-search">
      <label htmlFor={id} className="visually-hidden">
        Search media
      </label>
      <Search className="media-search-icon" aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="media-input media-search-input"
        placeholder="Search by name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  )
}

function Picker<T extends string>(props: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}): ReactElement {
  const id = useId()
  return (
    <span className="media-filter">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        className="media-select"
        value={props.value}
        onChange={(event) => {
          const chosen = props.options.find((option) => option.value === event.target.value)
          if (chosen) props.onChange(chosen.value)
        }}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Search, the tag filter, the page's order, and Bulk select */
export function MediaToolbar(props: MediaToolbarProps): ReactElement {
  const { filters, onFilters, tags } = props
  const tagOptions = [
    { value: '', label: 'All tags' },
    ...tags.map((tag) => ({ value: tag, label: tag })),
  ]
  return (
    <div className="media-toolbar">
      <SearchField value={filters.search} onChange={(search) => onFilters({ search })} />
      {tags.length > 0 && (
        <Picker
          label="Tag"
          value={filters.tag}
          options={tagOptions}
          onChange={(tag) => onFilters({ tag })}
        />
      )}
      <Picker
        label="Order this page"
        value={props.sort}
        options={SORT_OPTIONS.map((value) => ({ value, label: SORT_LABELS[value] }))}
        onChange={props.onSort}
      />
      <Button size="sm" icon={ListChecks} aria-pressed={props.bulk} onClick={props.onBulk}>
        Bulk select
      </Button>
    </div>
  )
}
