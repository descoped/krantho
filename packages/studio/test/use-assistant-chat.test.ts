import { describe, expect, it } from 'vitest'
import { routeContext } from '../src/hooks/use-assistant-chat.js'
import type {
  AssistantActivity,
  AssistantEvent,
  PendingActionView,
} from '../src/lib/api-assistant.js'
import {
  type AssistantChatAction,
  type AssistantChatState,
  assistantChatReducer,
  buildHistory,
  type ChatEntry,
  INITIAL_CHAT_STATE,
} from '../src/lib/assistant-chat-state.js'

function run(
  actions: readonly AssistantChatAction[],
  from = INITIAL_CHAT_STATE,
): AssistantChatState {
  return actions.reduce(assistantChatReducer, from)
}

function event(seq: number, e: AssistantEvent): AssistantChatAction {
  return { type: 'event', seq, event: e }
}

const PENDING: PendingActionView = {
  token: 'tok-1',
  kind: 'publish',
  title: 'Publish pages/about',
  confirmLabel: 'Publish',
  destructive: false,
  expiresAt: '2026-09-30T12:00:00.000Z',
}

function activity(overrides: Partial<AssistantActivity> = {}): AssistantActivity {
  return {
    id: 'call-1',
    tool: 'create_draft',
    status: 'done',
    summary: 'Created draft pages/pricing (v1)',
    documents: [{ collection: 'pages', slug: 'pricing', locale: 'en', version: 1 }],
    ...overrides,
  }
}

function reply(state: AssistantChatState, index = 1): Extract<ChatEntry, { kind: 'assistant' }> {
  const entry = state.entries[index]
  if (entry?.kind !== 'assistant') throw new Error('not an assistant entry')
  return entry
}

describe('assistantChatReducer', () => {
  it('send adds the user message and a streaming reply', () => {
    const state = run([{ type: 'send', text: 'Hello', seq: 1 }])
    expect(state.streaming).toBe(true)
    expect(state.entries[0]).toEqual({ kind: 'user', id: 'u1', text: 'Hello', notes: [] })
    expect(reply(state)).toMatchObject({ id: 'a1', text: '', streaming: true })
  })

  it('text events append in order; done ends the stream', () => {
    const state = run([
      { type: 'send', text: 'Hi', seq: 1 },
      event(1, { type: 'text', text: 'Hel' }),
      event(1, { type: 'text', text: 'lo' }),
      event(1, { type: 'done', reason: 'end_turn' }),
    ])
    expect(reply(state)).toMatchObject({ text: 'Hello', streaming: false })
    expect(state.streaming).toBe(false)
  })

  it('a running tool is replaced by its activity', () => {
    const running = run([
      { type: 'send', text: 'Draft it', seq: 1 },
      event(1, { type: 'tool', id: 'call-1', tool: 'create_draft', label: 'Create a draft' }),
    ])
    expect(reply(running).tools).toEqual([
      { id: 'call-1', tool: 'create_draft', label: 'Create a draft' },
    ])
    const done = run([event(1, { type: 'activity', activity: activity() })], running)
    expect(reply(done).tools).toEqual([])
    expect(reply(done).activities).toHaveLength(1)
  })

  it('an activity with a proposal opens a pending entry', () => {
    const state = run([
      { type: 'send', text: 'Publish', seq: 1 },
      event(1, {
        type: 'activity',
        activity: activity({ status: 'pending', pending: PENDING, summary: 'Proposed' }),
      }),
    ])
    expect(state.pending['tok-1']).toEqual({ view: PENDING, phase: 'open' })
  })

  it('an error event adds an error entry', () => {
    const state = run([
      { type: 'send', text: 'Hi', seq: 1 },
      event(1, { type: 'error', code: 'tools_unsupported', message: 'No tools' }),
      event(1, { type: 'done', reason: 'error' }),
    ])
    expect(state.entries.at(-1)).toMatchObject({ kind: 'error', code: 'tools_unsupported' })
  })

  it('a reply with nothing in it is dropped when the stream ends', () => {
    const state = run([
      { type: 'send', text: 'Hi', seq: 1 },
      { type: 'finish', seq: 1 },
    ])
    expect(state.entries.map((e) => e.kind)).toEqual(['user'])
    expect(state.streaming).toBe(false)
  })

  it('ignores events of a stream a reset left behind', () => {
    const state = run([
      { type: 'send', text: 'Hi', seq: 1 },
      { type: 'reset' },
      { type: 'send', text: 'Again', seq: 2 },
      event(1, { type: 'text', text: 'stale' }),
      { type: 'finish', seq: 1 },
    ])
    expect(state.entries).toHaveLength(2)
    expect(reply(state)).toMatchObject({ id: 'a2', text: '', streaming: true })
  })

  it('confirm and cancel resolve the proposal and leave a note for the next message', () => {
    const open = run([
      { type: 'send', text: 'Publish', seq: 1 },
      event(1, { type: 'activity', activity: activity({ status: 'pending', pending: PENDING }) }),
      { type: 'finish', seq: 1 },
    ])
    const confirming = run([{ type: 'confirming', token: 'tok-1' }], open)
    expect(confirming.pending['tok-1']?.phase).toBe('confirming')

    const done = run(
      [{ type: 'resolved', token: 'tok-1', ok: true, message: 'Published pages/about (v8)' }],
      confirming,
    )
    expect(done.pending['tok-1']).toMatchObject({
      phase: 'done',
      result: 'Published pages/about (v8)',
    })
    expect(done.notes).toEqual(['Confirmed: Publish pages/about — Published pages/about (v8)'])

    const cancelled = run([{ type: 'cancel', token: 'tok-1' }], open)
    expect(cancelled.pending['tok-1']?.phase).toBe('cancelled')
    expect(cancelled.notes).toEqual(['Cancelled: Publish pages/about'])

    const next = run([{ type: 'send', text: 'Next', seq: 2 }], cancelled)
    expect(next.entries.at(-2)).toMatchObject({
      kind: 'user',
      notes: ['Cancelled: Publish pages/about'],
    })
    expect(next.notes).toEqual([])
  })

  it('a failed confirmation is noted as failed', () => {
    const state = run([
      { type: 'send', text: 'Publish', seq: 1 },
      event(1, { type: 'activity', activity: activity({ status: 'pending', pending: PENDING }) }),
      { type: 'resolved', token: 'tok-1', ok: false, message: 'Changed since the proposal' },
    ])
    expect(state.pending['tok-1']?.phase).toBe('failed')
    expect(state.notes).toEqual([
      'Confirmation failed: Publish pages/about — Changed since the proposal',
    ])
  })

  it('cancel does nothing once a proposal is resolved', () => {
    const state = run([
      { type: 'send', text: 'Publish', seq: 1 },
      event(1, { type: 'activity', activity: activity({ status: 'pending', pending: PENDING }) }),
      { type: 'resolved', token: 'tok-1', ok: true, message: 'Done' },
      { type: 'cancel', token: 'tok-1' },
    ])
    expect(state.pending['tok-1']?.phase).toBe('done')
    expect(state.notes).toHaveLength(1)
  })

  it('reset clears the conversation', () => {
    const state = run([{ type: 'send', text: 'Hi', seq: 1 }, { type: 'reset' }])
    expect(state.entries).toEqual([])
    expect(state.streaming).toBe(false)
  })
})

describe('buildHistory', () => {
  const limits = { maxHistoryMessages: 40, maxInputChars: 60_000 }

  const conversation: ChatEntry[] = [
    { kind: 'user', id: 'u1', text: 'Draft a pricing page', notes: [] },
    {
      kind: 'assistant',
      id: 'a1',
      text: 'Done.',
      streaming: false,
      tools: [],
      activities: [activity()],
    },
    { kind: 'error', id: 'e1', code: 'limit', message: 'Stopped' },
  ]

  it('is text only, with one line per activity of a reply, and no error entries', () => {
    expect(buildHistory(conversation, 'Thanks', [], limits)).toEqual([
      { role: 'user', content: 'Draft a pricing page' },
      { role: 'assistant', content: 'Done.\n\n[Created draft pages/pricing (v1)]' },
      { role: 'user', content: 'Thanks' },
    ])
  })

  it('puts resolved proposals ahead of the new message and keeps earlier notes', () => {
    const entries: ChatEntry[] = [
      { kind: 'user', id: 'u1', text: 'Next', notes: ['Cancelled: Publish pages/about'] },
    ]
    expect(buildHistory(entries, 'More', ['Confirmed: X — done'], limits)).toEqual([
      { role: 'user', content: 'Cancelled: Publish pages/about\n\nNext' },
      { role: 'user', content: 'Confirmed: X — done\n\nMore' },
    ])
  })

  it('keeps the newest messages within the message limit, starting with a user message', () => {
    const history = buildHistory(conversation, 'Thanks', [], { ...limits, maxHistoryMessages: 2 })
    expect(history).toEqual([{ role: 'user', content: 'Thanks' }])
  })

  it('keeps the newest messages within the character limit', () => {
    const entries: ChatEntry[] = [
      { kind: 'user', id: 'u1', text: 'x'.repeat(50), notes: [] },
      { kind: 'assistant', id: 'a1', text: 'ok', streaming: false, tools: [], activities: [] },
      { kind: 'user', id: 'u2', text: 'second', notes: [] },
      { kind: 'assistant', id: 'a2', text: 'fine', streaming: false, tools: [], activities: [] },
    ]
    const history = buildHistory(entries, 'third', [], { ...limits, maxInputChars: 30 })
    expect(history).toEqual([
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'fine' },
      { role: 'user', content: 'third' },
    ])
  })
})

describe('routeContext', () => {
  it('names the document of the editor route', () => {
    expect(routeContext('/site/pages/about', '?locale=nb')).toEqual({
      collection: 'pages',
      slug: 'about',
      locale: 'nb',
    })
  })

  it('names the global of the Layout editor route', () => {
    expect(routeContext('/layout/footer', '')).toEqual({
      collection: 'globals',
      slug: 'footer',
      locale: undefined,
    })
  })

  it('names a document whose slug is new', () => {
    expect(routeContext('/site/pages/new', '')).toEqual({
      collection: 'pages',
      slug: 'new',
      locale: undefined,
    })
  })

  it('is undefined elsewhere, a new document included', () => {
    expect(routeContext('/site/pages', '')).toBeUndefined()
    expect(routeContext('/new/pages', '')).toBeUndefined()
    expect(routeContext('/structure', '')).toBeUndefined()
  })
})
