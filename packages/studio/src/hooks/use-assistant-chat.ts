import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router'
import {
  type AssistantChatRequest,
  type AssistantEvent,
  type AssistantStatus,
  confirmAssistantAction,
  fetchAssistantStatus,
  streamAssistantChat,
} from '../lib/api-assistant.js'
import { ApiError } from '../lib/api-client.js'
import {
  assistantChatReducer,
  buildHistory,
  type ChatEntry,
  INITIAL_CHAT_STATE,
  type PendingEntry,
} from '../lib/assistant-chat-state.js'
import { LAYOUT_COLLECTION } from '../lib/paths.js'

/** The document the user is editing, from Studio's editor routes */
export function routeContext(
  pathname: string,
  search: string,
): AssistantChatRequest['context'] | undefined {
  const locale = new URLSearchParams(search).get('locale') ?? undefined
  const layout = matchPath('/layout/:slug', pathname)
  if (layout?.params.slug)
    return { collection: LAYOUT_COLLECTION, slug: layout.params.slug, locale }
  const match = matchPath('/site/:collection/:slug', pathname)
  const collection = match?.params.collection
  const slug = match?.params.slug
  if (!collection || !slug) return undefined
  return { collection, slug, locale }
}

export type StatusState =
  | { phase: 'loading' }
  | { phase: 'ready'; status: AssistantStatus }
  | { phase: 'failed'; message: string }

/** The AI the user picked, kept in this browser so the next conversation starts on it */
const PROVIDER_KEY = 'krantho.assistant.provider'

function readPickedProvider(): string | null {
  try {
    return localStorage.getItem(PROVIDER_KEY)
  } catch {
    return null
  }
}

function rememberProvider(provider: string): void {
  try {
    localStorage.setItem(PROVIDER_KEY, provider)
  } catch {
    // The choice then lasts until the page is closed
  }
}

/** The AI the next message runs on: the one picked, when it is still on, else the site's own */
function pickedIn(status: StatusState, picked: string | null): string | null {
  if (status.phase !== 'ready' || !status.status.configured) return null
  const { providers } = status.status
  return providers.some((entry) => entry.provider === picked) ? picked : null
}

export interface AssistantChat {
  status: StatusState
  /** The AI picked in the dialog, or null for the site's own */
  picked: string | null
  pick(provider: string): void
  entries: ChatEntry[]
  streaming: boolean
  pending: Record<string, PendingEntry>
  send(text: string): void
  stop(): void
  confirm(token: string): Promise<boolean>
  confirmAll(tokens: readonly string[]): Promise<void>
  cancel(token: string): void
  reset(): void
}

function failure(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) {
    const code = typeof err.body.code === 'string' ? err.body.code : `http_${err.status}`
    return { code, message: err.message }
  }
  return { code: 'network', message: err instanceof Error ? err.message : 'Request failed' }
}

function useAssistantStatus(): StatusState {
  const [status, setStatus] = useState<StatusState>({ phase: 'loading' })
  useEffect(() => {
    let active = true
    fetchAssistantStatus()
      .then((value) => active && setStatus({ phase: 'ready', status: value }))
      .catch(
        (err: unknown) => active && setStatus({ phase: 'failed', message: failure(err).message }),
      )
    return () => {
      active = false
    }
  }, [])
  return status
}

/** The assistant conversation: status, entries, streaming and proposals */
export function useAssistantChat(): AssistantChat {
  const [state, dispatch] = useReducer(assistantChatReducer, INITIAL_CHAT_STATE)
  const status = useAssistantStatus()
  const [pickedRaw, setPicked] = useState(readPickedProvider)
  const picked = pickedIn(status, pickedRaw)
  const location = useLocation()
  const stateRef = useRef(state)
  const controller = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => () => controller.current?.abort(), [])

  const context = useMemo(
    () => routeContext(location.pathname, location.search),
    [location.pathname, location.search],
  )
  const limits = status.phase === 'ready' && status.status.configured ? status.status.limits : null

  const send = useCallback(
    (text: string): void => {
      const current = stateRef.current
      const message = text.trim()
      if (!limits || controller.current || message === '') return
      const messages = buildHistory(current.entries, message, current.notes, limits)
      const seq = ++seqRef.current
      dispatch({ type: 'send', text: message, seq })

      const abort = new AbortController()
      controller.current = abort
      const onEvent = (event: AssistantEvent): void => dispatch({ type: 'event', seq, event })
      const request = {
        messages,
        ...(context ? { context } : {}),
        ...(picked ? { provider: picked } : {}),
      }
      streamAssistantChat(request, onEvent, abort.signal)
        .catch((err: unknown) => {
          if (!abort.signal.aborted) dispatch({ type: 'fail', seq, ...failure(err) })
        })
        .finally(() => {
          if (controller.current === abort) controller.current = null
          dispatch({ type: 'finish', seq })
        })
    },
    [limits, context, picked],
  )

  const stop = useCallback((): void => controller.current?.abort(), [])

  const confirm = useCallback(async (token: string): Promise<boolean> => {
    if (stateRef.current.pending[token]?.phase !== 'open') return false
    dispatch({ type: 'confirming', token })
    try {
      const result = await confirmAssistantAction(token)
      const message = result.results.map((r) => r.message).join('; ') || 'Done'
      dispatch({ type: 'resolved', token, ok: result.ok, message })
      return result.ok
    } catch (err: unknown) {
      dispatch({ type: 'resolved', token, ok: false, message: failure(err).message })
      return false
    }
  }, [])

  const confirmAll = useCallback(
    async (tokens: readonly string[]): Promise<void> => {
      for (const token of tokens) {
        if (!(await confirm(token))) return
      }
    },
    [confirm],
  )

  const cancel = useCallback((token: string): void => dispatch({ type: 'cancel', token }), [])

  const reset = useCallback((): void => {
    controller.current?.abort()
    controller.current = null
    dispatch({ type: 'reset' })
  }, [])

  const pick = useCallback((provider: string): void => {
    rememberProvider(provider)
    setPicked(provider)
  }, [])

  return {
    status,
    picked,
    pick,
    entries: state.entries,
    streaming: state.streaming,
    pending: state.pending,
    send,
    stop,
    confirm,
    confirmAll,
    cancel,
    reset,
  }
}
