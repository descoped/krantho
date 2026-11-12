import { Search } from 'lucide-react'
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useFocusTrap } from '../hooks/use-focus-trap.js'
import { type AheadGroup, findDocumentsAhead } from '../lib/publish-ahead.js'
import { StatusDot } from '../ui/status-dot.js'
import { type PaletteActions, type PaletteState, usePaletteState } from './palette-state.js'
import { PublishAllModal } from './publish-all-modal.js'
import './command-palette.css'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /** Called when a command changed content, so the site tree refreshes */
  onContentChanged: () => void
}

/** ⌘K: commands with no query, matching documents with one; Esc closes */
export function CommandPalette({
  open,
  onClose,
  onContentChanged,
}: CommandPaletteProps): ReactElement | null {
  const [publish, setPublish] = useState<readonly AheadGroup[] | null>(null)
  const confirmPublishAll = useCallback(async (): Promise<void> => {
    setPublish(await findDocumentsAhead())
  }, [])

  useEffect(() => {
    if (!open) setPublish(null)
  }, [open])

  if (!open) return null
  if (publish) {
    return <PublishAllModal groups={publish} onClose={onClose} onPublished={onContentChanged} />
  }
  return <PaletteDialog onClose={onClose} confirmPublishAll={confirmPublishAll} />
}

function PaletteDialog(actions: PaletteActions): ReactElement {
  const state = usePaletteState(actions)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  useFocusTrap(dialogRef, true, inputRef)

  return (
    <div className="palette-layer">
      <div className="palette-scrim" aria-hidden="true" onClick={actions.onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') actions.onClose()
        }}
      >
        <PaletteInput inputRef={inputRef} listId={listId} state={state} />
        <p className="palette-status" role="status">
          {state.status}
        </p>
        <PaletteList listId={listId} state={state} />
        <p className="palette-hint" aria-hidden="true">
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move <kbd>↵</kbd> to open <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}

interface PaletteInputProps {
  inputRef: RefObject<HTMLInputElement | null>
  listId: string
  state: PaletteState
}

/** The combobox: focus stays here, and aria-activedescendant names the active row */
function PaletteInput({ inputRef, listId, state }: PaletteInputProps): ReactElement {
  const hasOptions = state.options.length > 0
  return (
    <div className="palette-search">
      <Search className="palette-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        className="palette-input"
        role="combobox"
        aria-expanded={hasOptions}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hasOptions ? `${listId}-${state.active}` : undefined}
        aria-label="Search documents or run a command"
        placeholder="Search documents or run a command…"
        autoComplete="off"
        spellCheck={false}
        value={state.query}
        onChange={(event) => state.setQuery(event.target.value)}
        onKeyDown={state.handleKeyDown}
      />
      <kbd className="palette-key">Esc</kbd>
    </div>
  )
}

/** The commands or matches; the combobox input owns the keys, rows answer the pointer */
function PaletteList({ listId, state }: { listId: string; state: PaletteState }): ReactElement {
  // Keep the active row in view as the arrow keys move it
  useEffect(() => {
    document.getElementById(`${listId}-${state.active}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, state.active])

  return (
    <div
      id={listId}
      role="listbox"
      aria-label={state.query.trim() === '' ? 'Commands' : 'Documents'}
      className="palette-list"
      hidden={state.options.length === 0}
    >
      {state.options.map((option, index) => {
        const Icon = option.icon
        return (
          // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the combobox (aria-activedescendant)
          // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input handles the keys (arrows, Enter)
          <div
            key={option.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === state.active}
            className="palette-option"
            onMouseMove={() => state.setActive(index)}
            onClick={() => void state.run(option)}
          >
            <span className="palette-option-icon" aria-hidden={option.status ? undefined : true}>
              {option.status ? <StatusDot status={option.status} /> : Icon && <Icon />}
            </span>
            <span className="palette-option-text">
              <span className="palette-option-label">{option.label}</span>
              <span className="palette-option-detail">{option.detail}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
