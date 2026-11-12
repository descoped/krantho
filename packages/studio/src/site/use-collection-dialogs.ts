import { useCallback, useRef, useState } from 'react'
import { useContentChanged } from '../shell/app-shell.js'
import type { BulkAction } from './bulk-modal.js'
import type { CollectionView } from './use-collection-view.js'

/** A bulk dialog keeps what it acts on, so it stays open with its result even if the list then fails to reload */
export type Dialog =
  | { kind: 'bulk'; action: BulkAction; slugs: string[]; locale: string }
  | { kind: 'import' }

export interface CollectionDialogs {
  dialog: Dialog | null
  openBulk: (action: BulkAction) => void
  openImport: () => void
  close: () => void
  /** A dialog changed documents: reload the list and the site tree */
  changed: () => void
}

/**
 * The collection view's dialogs. A bulk action that ran clears the selection,
 * which removes the selection bar whose button opened the dialog; on close,
 * `requestFocus` then moves focus to the listing (or to the error that
 * replaced it), never to the page's body.
 */
export function useCollectionDialogs(
  view: CollectionView,
  requestFocus: () => void,
): CollectionDialogs {
  const contentChanged = useContentChanged()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const ran = useRef(false)
  const { selection, reload, loaded } = view
  const locale = loaded.state === 'ready' ? loaded.data.locale : null

  const openBulk = useCallback(
    (action: BulkAction) => {
      if (!locale) return
      ran.current = false
      setDialog({ kind: 'bulk', action, slugs: selection.slugs, locale })
    },
    [selection.slugs, locale],
  )
  const openImport = useCallback(() => {
    ran.current = false
    setDialog({ kind: 'import' })
  }, [])
  const close = useCallback(() => {
    if (ran.current && dialog?.kind === 'bulk') requestFocus()
    setDialog(null)
  }, [dialog, requestFocus])
  const changed = useCallback(() => {
    ran.current = true
    selection.clear()
    reload()
    contentChanged()
  }, [selection, reload, contentChanged])

  return { dialog, openBulk, openImport, close, changed }
}
