import { MessageSquarePlus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { type StatusState, useAssistantChat } from '../../hooks/use-assistant-chat.js'
import { useAuth } from '../../lib/auth.js'
import { AI_SETUP_PATH } from '../../lib/paths.js'
import { ConfirmDialog } from '../ConfirmDialog.js'
import { AssistantComposer } from './AssistantComposer.js'
import { AssistantMessage } from './AssistantMessage.js'
import { useAssistantToggle } from './AssistantProvider.js'
import './assistant.css'

/** Within this many pixels of the bottom, the log follows the stream */
const STICK_THRESHOLD_PX = 48

/** What the assistant runs on, in plain words: the AI's name and its model */
function modelLine(status: StatusState, picked: string | null): string {
  if (status.phase === 'loading') return 'Connecting…'
  if (status.phase !== 'ready' || !status.status.configured) return 'Not available'
  const { provider, model, providers } = status.status
  const shown = picked ?? provider
  const label = providers.find((entry) => entry.provider === shown)?.label ?? shown
  // The model is known only for the AI the site uses; another runs its own
  if (shown !== provider) return label
  // With a picker the name is already shown there
  return providers.length > 1 ? model : `${label} · ${model}`
}

/** The AIs that are on, to pick between; nothing to pick with one */
function AiPicker({
  status,
  picked,
  onPick,
}: {
  status: StatusState
  picked: string | null
  onPick: (provider: string) => void
}): React.ReactElement | null {
  if (status.phase !== 'ready' || !status.status.configured) return null
  const { providers, provider } = status.status
  if (providers.length < 2) return null
  return (
    <select
      className="assistant-picker"
      aria-label="AI used by the assistant"
      value={picked ?? provider}
      onChange={(event) => onPick(event.target.value)}
    >
      {providers.map((entry) => (
        <option key={entry.provider} value={entry.provider}>
          {entry.label}
        </option>
      ))}
    </select>
  )
}

/** Why the assistant cannot take a message, or null when it can */
function StatusNotice({
  status,
  canOpenSettings,
}: {
  status: StatusState
  canOpenSettings: boolean
}): React.ReactElement | null {
  if (status.phase === 'loading') return null
  if (status.phase === 'failed') {
    // A refusal (403 below `assistant.role`) or an unreachable API — nothing to fix in Setup
    return (
      <div className="assistant-entry assistant-entry-error" role="alert">
        <p>{status.message}</p>
      </div>
    )
  }
  if (status.status.configured) return null
  return (
    <div className="assistant-entry assistant-entry-error" role="alert">
      <p>{status.status.error}</p>
      {canOpenSettings && <Link to={AI_SETUP_PATH}>Open Setup › AI provider</Link>}
    </div>
  )
}

/** Title, the model in use, New conversation and Close */
function AssistantHeader({
  status,
  picked,
  onPick,
  canReset,
  onReset,
  onClose,
}: {
  status: StatusState
  picked: string | null
  onPick: (provider: string) => void
  canReset: boolean
  onReset: () => void
  onClose: () => void
}): React.ReactElement {
  return (
    <header className="assistant-header">
      <div className="assistant-header-text">
        <h2 className="assistant-title">Assistant</h2>
        <div className="assistant-ai-row">
          <AiPicker status={status} picked={picked} onPick={onPick} />
          <p className="assistant-muted assistant-model">{modelLine(status, picked)}</p>
        </div>
      </div>
      <button type="button" className="assistant-icon-btn" onClick={onReset} disabled={!canReset}>
        <MessageSquarePlus aria-hidden="true" />
        New conversation
      </button>
      <button
        type="button"
        className="assistant-icon-btn"
        aria-label="Close assistant"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
    </header>
  )
}

/** Follow the newest entry unless the user scrolled up to read */
function useStickyScroll(dependency: unknown): {
  logRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
} {
  const logRef = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const onScroll = useCallback((): void => {
    const log = logRef.current
    if (!log) return
    stick.current = log.scrollHeight - log.scrollTop - log.clientHeight < STICK_THRESHOLD_PX
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the log's content changes
  useEffect(() => {
    const log = logRef.current
    if (log && stick.current) log.scrollTop = log.scrollHeight
  }, [dependency])
  return { logRef, onScroll }
}

/**
 * The assistant: a non-modal panel on the right edge. Mounted on first open and
 * kept mounted (hidden when closed), so the conversation survives navigation.
 */
export function AssistantPanel(): React.ReactElement | null {
  const toggle = useAssistantToggle()
  const chat = useAssistantChat()
  const { hasRole } = useAuth()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [askReset, setAskReset] = useState(false)
  const { logRef, onScroll } = useStickyScroll(chat.entries)
  const open = toggle?.open ?? false
  const ready = chat.status.phase === 'ready' && chat.status.status.configured

  // Focus the composer on open, and once it is enabled when the panel opens for the first time
  useEffect(() => {
    if (open && ready) inputRef.current?.focus()
  }, [open, ready])

  if (!toggle) return null

  const canOpenSettings = hasRole('admin')
  const hasOpenProposal = Object.values(chat.pending).some((entry) => entry.phase === 'open')

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    setAskReset(false)
    toggle.close()
  }
  const newConversation = (): void => {
    if (chat.streaming || hasOpenProposal) setAskReset(true)
    else chat.reset()
  }

  return (
    <aside
      id="assistant-panel"
      className="assistant-panel"
      aria-label="Assistant"
      hidden={!open}
      onKeyDown={onKeyDown}
    >
      <AssistantHeader
        status={chat.status}
        picked={chat.picked}
        onPick={chat.pick}
        canReset={chat.entries.length > 0}
        onReset={newConversation}
        onClose={toggle.close}
      />

      <div
        ref={logRef}
        className="assistant-log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={onScroll}
      >
        <StatusNotice status={chat.status} canOpenSettings={canOpenSettings} />
        {chat.entries.length === 0 && ready && (
          <p className="assistant-muted assistant-intro">
            Ask for content, SEO or AEO work. What the assistant writes is saved as a draft;
            publishing, deleting and replacing text wait for your confirmation here.
          </p>
        )}
        {chat.entries.map((entry) => (
          <AssistantMessage
            key={entry.id}
            entry={entry}
            pending={chat.pending}
            canOpenSettings={canOpenSettings}
            onConfirm={(token) => void chat.confirm(token)}
            onConfirmAll={(tokens) => void chat.confirmAll(tokens)}
            onCancel={chat.cancel}
          />
        ))}
      </div>

      <AssistantComposer
        disabled={!ready}
        streaming={chat.streaming}
        onSend={chat.send}
        onStop={chat.stop}
        inputRef={inputRef}
      />

      {askReset && (
        <ConfirmDialog
          title="Start a new conversation?"
          message="The current reply stops and proposals waiting for confirmation are dropped."
          confirmLabel="Start over"
          onConfirm={() => {
            setAskReset(false)
            chat.reset()
          }}
          onCancel={() => setAskReset(false)}
        />
      )}
    </aside>
  )
}
