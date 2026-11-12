import type { LucideIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  MIN_QUERY_LENGTH,
  type SearchState,
  useDocumentSearch,
} from '../hooks/use-document-search.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'
import { errorMessage } from '../lib/fetch.js'
import { collectionLabel } from '../lib/format.js'
import { editorPath } from '../lib/paths.js'
import { type PaletteCommand, usePaletteCommands } from './palette-commands.js'

/** One row of the palette: a command, or a matching document */
export interface PaletteOption {
  id: string
  label: string
  detail: string
  icon?: LucideIcon | undefined
  status?: DocumentStatus | undefined
  run: () => void | Promise<void>
}

export interface PaletteActions {
  onClose: () => void
  confirmPublishAll: () => Promise<void>
}

/** What the palette shows and how its keys behave */
export interface PaletteState {
  query: string
  setQuery: (query: string) => void
  active: number
  setActive: (index: number) => void
  options: readonly PaletteOption[]
  status: string | null
  run: (option: PaletteOption | undefined) => Promise<void>
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

function commandOptions(commands: readonly PaletteCommand[]): PaletteOption[] {
  return commands.map(({ id, label, detail, icon, run }) => ({ id, label, detail, icon, run }))
}

function documentOptions(search: SearchState, open: (path: string) => void): PaletteOption[] {
  if (search.phase !== 'done') return []
  return search.items.map(({ meta, fields }) => ({
    id: `${meta.collection}/${meta.slug}/${meta.locale}`,
    label: typeof fields.title === 'string' && fields.title ? fields.title : meta.slug,
    detail: `${collectionLabel(meta.collection)} · ${meta.slug}`,
    status: documentStatus(meta),
    run: () => open(editorPath(meta.collection, meta.slug)),
  }))
}

/** What the status line says, or null when the list speaks for itself */
function statusText(query: string, search: SearchState, count: number): string | null {
  const term = query.trim()
  if (term === '') return count === 0 ? 'No commands are available to you here.' : null
  if (term.length < MIN_QUERY_LENGTH) return 'Keep typing to search documents.'
  if (search.phase === 'loading') return 'Searching…'
  if (search.phase === 'failed') return search.message
  if (search.phase === 'done' && count === 0) return `No documents match “${term}”.`
  return null
}

/** The rows for the query: the commands with none, matching documents with one */
function usePaletteOptions(
  query: string,
  actions: PaletteActions,
): { options: PaletteOption[]; search: SearchState } {
  const navigate = useNavigate()
  const search = useDocumentSearch(query)
  const commands = usePaletteCommands({
    close: actions.onClose,
    confirmPublishAll: actions.confirmPublishAll,
  })
  if (query.trim() === '') return { options: commandOptions(commands), search }
  const open = (path: string): void => {
    actions.onClose()
    void navigate(path)
  }
  return { options: documentOptions(search, open), search }
}

/** Up and Down move the active row, wrapping; Enter runs it */
function keyHandler(
  options: readonly PaletteOption[],
  active: number,
  setActive: (move: (index: number) => number) => void,
  run: (option: PaletteOption | undefined) => Promise<void>,
): (event: KeyboardEvent<HTMLInputElement>) => void {
  return (event) => {
    const count = options.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (count === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index + step + count) % count)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void run(options[active])
    }
  }
}

/** The query, its rows, the active row, the status line and the keys */
export function usePaletteState(actions: PaletteActions): PaletteState {
  const [query, setQueryState] = useState('')
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const { options, search } = usePaletteOptions(query, actions)
  const status = notice ?? statusText(query, search, options.length)

  // A new query or a new list of matches starts from the top
  // biome-ignore lint/correctness/useExhaustiveDependencies: query and the count are the triggers
  useEffect(() => setActive(0), [query, options.length])

  async function run(option: PaletteOption | undefined): Promise<void> {
    if (!option) return
    setNotice(option.id === 'publish-all' ? 'Counting drafts ahead of live…' : null)
    try {
      await option.run()
    } catch (err: unknown) {
      setNotice(errorMessage(err, `${option.label} failed`))
    }
  }

  const setQuery = (next: string): void => {
    setQueryState(next)
    setNotice(null)
  }
  const handleKeyDown = keyHandler(options, active, setActive, run)
  return { query, setQuery, active, setActive, options, status, run, handleKeyDown }
}
