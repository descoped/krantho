import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCapabilities } from '../lib/capabilities.js'
import {
  isSortOrder,
  isStatusFilter,
  type SiteRow,
  type SortOrder,
  type StatusCounts,
  type StatusFilter,
  selectedShown,
  shownRows,
  statusCounts,
  toggleAllShown,
} from './site-model.js'
import { type CollectionViewData, loadCollectionView } from './site-sources.js'
import { type Loaded, useLoaded } from './use-loaded.js'

/** The view's choices, kept in the URL so a filtered list can be shared and goes back right */
export interface ViewChoices {
  filter: StatusFilter
  order: SortOrder
  /** The locale asked for; the loaded data says which one was read */
  locale: string | null
}

export interface RowSelectionState {
  /** The selected rows that are shown */
  slugs: string[]
  selected: ReadonlySet<string>
  toggle: (slug: string) => void
  toggleAll: () => void
  clear: () => void
}

export interface CollectionView {
  loaded: Loaded<CollectionViewData>
  reload: () => void
  choices: ViewChoices
  choose: (key: 'status' | 'sort' | 'locale', value: string, fallback: string) => void
  rows: SiteRow[]
  counts: StatusCounts
  selection: RowSelectionState
}

function useChoices(): [ViewChoices, CollectionView['choose']] {
  const [params, setParams] = useSearchParams()
  const status = params.get('status')
  const sort = params.get('sort')
  const choices: ViewChoices = {
    filter: isStatusFilter(status) ? status : 'all',
    order: isSortOrder(sort) ? sort : 'updated',
    locale: params.get('locale'),
  }
  const choose = useCallback<CollectionView['choose']>(
    (key, value, fallback) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value === fallback) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [choices, choose]
}

function useRowSelection(shown: readonly string[]): RowSelectionState {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggle = useCallback((slug: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(slug)) next.add(slug)
      return next
    })
  }, [])
  const toggleAll = useCallback(
    () => setSelected((current) => toggleAllShown(current, shown)),
    [shown],
  )
  const clear = useCallback(() => setSelected(new Set()), [])
  return { slugs: selectedShown(selected, shown), selected, toggle, toggleAll, clear }
}

/** A collection's documents in one locale, filtered and sorted as the URL says, with row selection */
export function useCollectionView(name: string): CollectionView {
  const caps = useCapabilities()
  const [choices, setChoice] = useChoices()
  const load = useCallback(
    () => loadCollectionView(caps, name, choices.locale),
    [caps, name, choices.locale],
  )
  const { loaded, reload } = useLoaded(load, 'The collection could not load')
  const all = loaded.state === 'ready' ? loaded.data.rows : null
  const rows = useMemo(
    () => (all ? shownRows(all, choices.filter, choices.order) : []),
    [all, choices.filter, choices.order],
  )
  const counts = useMemo(() => statusCounts(all ?? []), [all])
  const shown = useMemo(() => rows.map((row) => row.slug), [rows])
  const selection = useRowSelection(shown)
  const { clear } = selection
  const choose = useCallback<CollectionView['choose']>(
    (key, value, fallback) => {
      // A new filter or locale starts a new selection: rows it hides are never acted on
      if (key !== 'sort') clear()
      setChoice(key, value, fallback)
    },
    [clear, setChoice],
  )
  return { loaded, reload, choices, choose, rows, counts, selection }
}
