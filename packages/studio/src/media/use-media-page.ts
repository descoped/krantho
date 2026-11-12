import { useCallback, useEffect, useState } from 'react'
import type { MediaItem } from '../lib/api.js'

/** Move focus to the tile of a file, when it is shown; otherwise to the page's content */
export function focusTile(id: string): void {
  queueMicrotask(() => {
    const tiles = document.querySelectorAll<HTMLElement>('[data-media-id]')
    const tile = [...tiles].find((element) => element.getAttribute('data-media-id') === id)
    ;(tile ?? document.getElementById('studio-main'))?.focus()
  })
}

export interface OpenFile {
  item: MediaItem | null
  open: (item: MediaItem) => void
  /** Close the drawer; focus returns to the file's tile */
  close: () => void
  /** Close without moving focus — the file is gone */
  drop: () => void
  update: (item: MediaItem) => void
}

/** The file whose details are open, kept in step with the page as it is read again */
export function useOpenFile(items: readonly MediaItem[]): OpenFile {
  const [item, setItem] = useState<MediaItem | null>(null)
  useEffect(() => {
    setItem((current) => (current && items.find((next) => next.id === current.id)) ?? current)
  }, [items])
  const close = useCallback(() => {
    setItem((current) => {
      if (current) focusTile(current.id)
      return null
    })
  }, [])
  const drop = useCallback(() => setItem(null), [])
  return { item, open: setItem, close, drop, update: setItem }
}

export interface Selection {
  on: boolean
  toggleMode: () => void
  ids: ReadonlySet<string>
  /** The selected files, across pages */
  items: MediaItem[]
  toggle: (item: MediaItem) => void
  add: (items: readonly MediaItem[]) => void
  remove: (ids: readonly string[]) => void
  clear: () => void
}

/** Bulk select: which files are selected, kept across pages until cleared or the mode ends */
export function useSelection(): Selection {
  const [on, setOn] = useState(false)
  const [selected, setSelected] = useState<ReadonlyMap<string, MediaItem>>(new Map())
  const edit = (change: (next: Map<string, MediaItem>) => void): void =>
    setSelected((current) => {
      const next = new Map(current)
      change(next)
      return next
    })
  return {
    on,
    toggleMode: () => {
      setOn((value) => !value)
      setSelected(new Map())
    },
    ids: new Set(selected.keys()),
    items: [...selected.values()],
    toggle: (item) =>
      edit((next) => {
        if (!next.delete(item.id)) next.set(item.id, item)
      }),
    add: (items) =>
      edit((next) => {
        for (const item of items) next.set(item.id, item)
      }),
    remove: (ids) =>
      edit((next) => {
        for (const id of ids) next.delete(id)
      }),
    clear: () => setSelected(new Map()),
  }
}
