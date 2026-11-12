import { type ReactElement, useId } from 'react'
import { STATUS_LABELS } from '../lib/document-status.js'
import { StatusDot } from '../ui/status-dot.js'
import {
  SORT_ORDERS,
  type SortOrder,
  STATUS_FILTERS,
  type StatusCounts,
  type StatusFilter,
  shownCount,
} from './site-model.js'

const SORT_LABELS: Readonly<Record<SortOrder, string>> = {
  updated: 'Last updated',
  slug: 'Slug',
}

function countOf(filter: StatusFilter, counts: StatusCounts): number {
  return filter === 'all' ? counts.total : counts[filter]
}

/** The §2 statuses as a row of toggle buttons, each with its count */
function StatusFilters({
  filter,
  counts,
  onFilter,
}: {
  filter: StatusFilter
  counts: StatusCounts
  onFilter: (filter: StatusFilter) => void
}): ReactElement {
  return (
    <fieldset className="site-filters">
      <legend className="visually-hidden">Status</legend>
      {STATUS_FILTERS.map((option) => (
        <button
          key={option}
          type="button"
          className="site-filter"
          aria-pressed={filter === option}
          onClick={() => onFilter(option)}
        >
          {option !== 'all' && <StatusDot status={option} decorative />}
          {option === 'all' ? 'All' : STATUS_LABELS[option]}
          <span className="site-filter-count">{countOf(option, counts)}</span>
        </button>
      ))}
    </fieldset>
  )
}

function Picker<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  labelOf: (option: T) => string
  onChange: (value: T) => void
}): ReactElement {
  const id = useId()
  return (
    <span className="site-picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.target.value)
          if (next !== undefined) onChange(next)
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelOf(option)}
          </option>
        ))}
      </select>
    </span>
  )
}

export interface CollectionToolbarProps {
  filter: StatusFilter
  order: SortOrder
  locale: string
  locales: readonly string[]
  counts: StatusCounts
  shown: number
  onFilter: (filter: StatusFilter) => void
  onOrder: (order: SortOrder) => void
  onLocale: (locale: string) => void
}

/** The status filter, the sort, the locale (when the site has several) and the shown-count */
export function CollectionToolbar(props: CollectionToolbarProps): ReactElement {
  return (
    <div className="site-toolbar">
      <StatusFilters filter={props.filter} counts={props.counts} onFilter={props.onFilter} />
      <div className="site-toolbar-end">
        {props.locales.length > 1 && (
          <Picker
            label="Locale"
            value={props.locale}
            options={props.locales}
            labelOf={(locale) => locale}
            onChange={props.onLocale}
          />
        )}
        <Picker
          label="Sort"
          value={props.order}
          options={SORT_ORDERS}
          labelOf={(order) => SORT_LABELS[order]}
          onChange={props.onOrder}
        />
        <p className="site-shown" role="status">
          <span className="site-shown-number">{shownCount(props.shown, props.counts.total)}</span>{' '}
          shown
        </p>
      </div>
    </div>
  )
}
