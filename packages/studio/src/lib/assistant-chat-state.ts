import type {
  AssistantActivity,
  AssistantChatRequest,
  AssistantEvent,
  AssistantLimits,
  PendingActionView,
} from './api-assistant.js'

export interface RunningTool {
  id: string
  tool: string
  label: string
}

export type ChatEntry =
  | {
      kind: 'user'
      id: string
      text: string
      /** Confirm/cancel outcomes sent ahead of this message, not shown */
      notes: string[]
    }
  | {
      kind: 'assistant'
      id: string
      text: string
      streaming: boolean
      tools: RunningTool[]
      activities: AssistantActivity[]
    }
  | { kind: 'error'; id: string; code: string; message: string }

export type PendingPhase = 'open' | 'confirming' | 'done' | 'failed' | 'cancelled'

export interface PendingEntry {
  view: PendingActionView
  phase: PendingPhase
  /** The server's result line once confirmed, or why it failed */
  result?: string | undefined
}

export interface AssistantChatState {
  entries: ChatEntry[]
  streaming: boolean
  /** Proposals by token */
  pending: Record<string, PendingEntry>
  /** Proposals resolved since the last message, told to the assistant with the next one */
  notes: string[]
  /** The assistant entry the current stream writes to */
  streamId: string | null
  /** Numbers error entries */
  nextId: number
}

export type AssistantChatAction =
  | { type: 'send'; text: string; seq: number }
  | { type: 'event'; seq: number; event: AssistantEvent }
  | { type: 'fail'; seq: number; code: string; message: string }
  | { type: 'finish'; seq: number }
  | { type: 'confirming'; token: string }
  | { type: 'resolved'; token: string; ok: boolean; message: string }
  | { type: 'cancel'; token: string }
  | { type: 'reset' }

export const INITIAL_CHAT_STATE: AssistantChatState = {
  entries: [],
  streaming: false,
  pending: {},
  notes: [],
  streamId: null,
  nextId: 1,
}

type AssistantEntry = Extract<ChatEntry, { kind: 'assistant' }>

function updateStreamEntry(
  state: AssistantChatState,
  update: (entry: AssistantEntry) => AssistantEntry,
): ChatEntry[] {
  return state.entries.map((entry) =>
    entry.kind === 'assistant' && entry.id === state.streamId ? update(entry) : entry,
  )
}

function withError(state: AssistantChatState, code: string, message: string): AssistantChatState {
  const entry: ChatEntry = { kind: 'error', id: `e${state.nextId}`, code, message }
  return { ...state, entries: [...state.entries, entry], nextId: state.nextId + 1 }
}

function applyActivity(state: AssistantChatState, activity: AssistantActivity): AssistantChatState {
  const entries = updateStreamEntry(state, (entry) => ({
    ...entry,
    tools: entry.tools.filter((tool) => tool.id !== activity.id),
    activities: [...entry.activities, activity],
  }))
  const view = activity.pending
  if (!view) return { ...state, entries }
  return { ...state, entries, pending: { ...state.pending, [view.token]: { view, phase: 'open' } } }
}

function applyEvent(state: AssistantChatState, event: AssistantEvent): AssistantChatState {
  switch (event.type) {
    case 'text':
      return {
        ...state,
        entries: updateStreamEntry(state, (entry) => ({ ...entry, text: entry.text + event.text })),
      }
    case 'tool': {
      const tool = { id: event.id, tool: event.tool, label: event.label }
      return {
        ...state,
        entries: updateStreamEntry(state, (entry) => ({ ...entry, tools: [...entry.tools, tool] })),
      }
    }
    case 'activity':
      return applyActivity(state, event.activity)
    case 'error':
      return withError(state, event.code, event.message)
    case 'done':
      return finishStream(state)
    default:
      return state
  }
}

/** The stream ended: the entry stops being busy, and an entry with nothing in it goes */
function finishStream(state: AssistantChatState): AssistantChatState {
  if (state.streamId === null) return state
  const entries = state.entries.flatMap((entry): ChatEntry[] => {
    if (entry.kind !== 'assistant' || entry.id !== state.streamId) return [entry]
    if (entry.text === '' && entry.activities.length === 0) return []
    return [{ ...entry, streaming: false, tools: [] }]
  })
  return { ...state, entries, streaming: false, streamId: null }
}

/** Whether an action belongs to the stream in progress (not one a reset left behind) */
function isStream(state: AssistantChatState, seq: number): boolean {
  return state.streamId === `a${seq}`
}

function resolvePending(
  state: AssistantChatState,
  token: string,
  phase: PendingPhase,
  result: string | undefined,
  note: string | null,
): AssistantChatState {
  const current = state.pending[token]
  if (!current) return state
  return {
    ...state,
    pending: { ...state.pending, [token]: { ...current, phase, result } },
    notes: note === null ? state.notes : [...state.notes, note],
  }
}

function resolvedNote(title: string, ok: boolean, message: string): string {
  return ok ? `Confirmed: ${title} — ${message}` : `Confirmation failed: ${title} — ${message}`
}

export function assistantChatReducer(
  state: AssistantChatState,
  action: AssistantChatAction,
): AssistantChatState {
  switch (action.type) {
    case 'send': {
      const user: ChatEntry = {
        kind: 'user',
        id: `u${action.seq}`,
        text: action.text,
        notes: state.notes,
      }
      const streamId = `a${action.seq}`
      const reply: ChatEntry = {
        kind: 'assistant',
        id: streamId,
        text: '',
        streaming: true,
        tools: [],
        activities: [],
      }
      const entries = [...state.entries, user, reply]
      return { ...state, entries, streaming: true, streamId, notes: [] }
    }
    case 'event':
      return isStream(state, action.seq) ? applyEvent(state, action.event) : state
    case 'fail':
      return isStream(state, action.seq) ? withError(state, action.code, action.message) : state
    case 'finish':
      return isStream(state, action.seq) ? finishStream(state) : state
    case 'confirming':
      return resolvePending(state, action.token, 'confirming', undefined, null)
    case 'resolved': {
      const title = state.pending[action.token]?.view.title ?? ''
      const note = resolvedNote(title, action.ok, action.message)
      const phase = action.ok ? 'done' : 'failed'
      return resolvePending(state, action.token, phase, action.message, note)
    }
    case 'cancel': {
      const entry = state.pending[action.token]
      if (entry?.phase !== 'open') return state
      return resolvePending(
        state,
        action.token,
        'cancelled',
        undefined,
        `Cancelled: ${entry.view.title}`,
      )
    }
    case 'reset':
      return { ...INITIAL_CHAT_STATE, nextId: state.nextId }
  }
}

type HistoryMessage = AssistantChatRequest['messages'][number]

function withNotes(notes: readonly string[], text: string): string {
  return notes.length === 0 ? text : `${notes.join('\n')}\n\n${text}`
}

/** The conversation as text turns: a reply carries one line per thing it did */
function entryMessage(entry: ChatEntry): HistoryMessage | null {
  if (entry.kind === 'user') return { role: 'user', content: withNotes(entry.notes, entry.text) }
  if (entry.kind !== 'assistant') return null
  const lines = entry.activities.map((activity) => `[${activity.summary}]`).join('\n')
  const content = [entry.text.trim(), lines].filter((part) => part !== '').join('\n\n')
  return content === '' ? null : { role: 'assistant', content }
}

/**
 * The text-only history for the next request: the conversation plus the new
 * message (with the notes of proposals resolved since the last one), trimmed to
 * the newest messages within the server's limits and starting with the user's.
 */
export function buildHistory(
  entries: readonly ChatEntry[],
  text: string,
  notes: readonly string[],
  limits: Pick<AssistantLimits, 'maxHistoryMessages' | 'maxInputChars'>,
): HistoryMessage[] {
  const messages = entries.flatMap((entry) => entryMessage(entry) ?? [])
  messages.push({ role: 'user', content: withNotes(notes, text) })

  const kept: HistoryMessage[] = []
  let chars = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || kept.length >= limits.maxHistoryMessages) break
    if (kept.length > 0 && chars + message.content.length > limits.maxInputChars) break
    kept.unshift(message)
    chars += message.content.length
  }
  while (kept.length > 1 && kept[0]?.role !== 'user') kept.shift()
  return kept
}
