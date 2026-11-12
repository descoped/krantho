import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { ChatEntry, PendingEntry } from '../../lib/assistant-chat-state.js'
import { renderAssistantMarkdown } from '../../lib/assistant-markdown.js'
import { AI_SETUP_PATH } from '../../lib/paths.js'
import { buttonClass } from '../../ui/button.js'
import { AssistantActivityEntry } from './AssistantActivity.js'

/** Error codes that a change in Setup › AI provider can fix */
const SETTINGS_CODES: ReadonlySet<string> = new Set([
  'tools_unsupported',
  'llm_unconfigured',
  'llm_credential_missing',
])

/** The latest value, at most once per animation frame — markdown is not re-rendered per delta */
function useFrameThrottled(value: string): string {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  const frame = useRef<number | null>(null)
  useEffect(() => {
    latest.current = value
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      setShown(latest.current)
    })
  }, [value])
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )
  return shown
}

interface ReplyProps {
  entry: Extract<ChatEntry, { kind: 'assistant' }>
  pending: Record<string, PendingEntry>
  onConfirm: (token: string) => void
  onConfirmAll: (tokens: readonly string[]) => void
  onCancel: (token: string) => void
}

function AssistantReply({
  entry,
  pending,
  onConfirm,
  onConfirmAll,
  onCancel,
}: ReplyProps): React.ReactElement {
  const throttled = useFrameThrottled(entry.text)
  const text = entry.streaming ? throttled : entry.text
  const html = useMemo(() => renderAssistantMarkdown(text), [text])
  const openTokens = entry.activities.flatMap((activity) => {
    const token = activity.pending?.token
    return token && pending[token]?.phase === 'open' ? [token] : []
  })

  return (
    <div className="assistant-entry assistant-entry-assistant" aria-busy={entry.streaming}>
      <span className="assistant-sr-only">Assistant:</span>
      {html !== '' && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by renderAssistantMarkdown
        <div className="assistant-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {(entry.tools.length > 0 || entry.activities.length > 0) && (
        <ul className="assistant-activities">
          {entry.activities.map((activity) => (
            <AssistantActivityEntry
              key={activity.id}
              activity={activity}
              pending={activity.pending ? pending[activity.pending.token] : undefined}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          ))}
          {entry.tools.map((tool) => (
            <li key={tool.id} className="assistant-activity assistant-activity-running">
              <p className="assistant-activity-summary">
                <Loader2 className="assistant-spinner" role="img" aria-label="Running" />
                <span>{tool.label}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {openTokens.length > 1 && (
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          onClick={() => onConfirmAll(openTokens)}
        >
          Confirm all
        </button>
      )}
      {entry.streaming && entry.tools.length === 0 && text === '' && (
        <p className="assistant-muted">
          <Loader2 className="assistant-spinner" aria-hidden="true" /> Thinking…
        </p>
      )}
    </div>
  )
}

interface AssistantMessageProps extends Omit<ReplyProps, 'entry'> {
  entry: ChatEntry
  /** Whether the user may open Settings (admins) */
  canOpenSettings: boolean
}

/** One entry of the conversation: the user's message, a reply, or an error */
export function AssistantMessage({
  entry,
  canOpenSettings,
  ...handlers
}: AssistantMessageProps): React.ReactElement {
  if (entry.kind === 'user') {
    return (
      <div className="assistant-entry assistant-entry-user">
        <span className="assistant-sr-only">You:</span>
        <p>{entry.text}</p>
      </div>
    )
  }
  if (entry.kind === 'error') {
    return (
      <div className="assistant-entry assistant-entry-error" role="alert">
        <p>{entry.message}</p>
        {canOpenSettings && SETTINGS_CODES.has(entry.code) && (
          <Link to={AI_SETUP_PATH}>Open Setup › AI provider</Link>
        )}
      </div>
    )
  }
  return <AssistantReply entry={entry} {...handlers} />
}
