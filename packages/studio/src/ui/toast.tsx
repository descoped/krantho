import { CircleAlert, CircleCheck, X } from 'lucide-react'
import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import './toast.css'

export type ToastTone = 'success' | 'error'

export interface ToastInput {
  text: string
  /** Success dismisses itself after a while; an error stays until dismissed */
  tone?: ToastTone | undefined
}

interface ToastEntry {
  id: number
  text: string
  tone: ToastTone
}

/** How long a success toast stays, unless pointer or focus rests on it */
const SUCCESS_MS = 6000
/** The most toasts shown at once; the oldest goes first */
const MAX_TOASTS = 3

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

/** Show a toast: bottom-right, announced politely */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs a ToastProvider')
  return show
}

/** A success toast's timer, paused while the pointer or focus rests on it */
function useDismissTimer(tone: ToastTone, onDismiss: () => void): (paused: boolean) => void {
  const [paused, setPaused] = useState(false)
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  }, [onDismiss])
  useEffect(() => {
    if (tone !== 'success' || paused) return
    const timer = setTimeout(() => dismiss.current(), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [tone, paused])
  return setPaused
}

/**
 * A toast that goes while it holds focus — dismissed, or pushed out by a newer
 * one — takes the focused control with it: focus moves to another toast's
 * Dismiss, or to the page's content
 */
function useFocusHandOver(root: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const element = root.current
    return () => {
      if (!element?.contains(document.activeElement)) return
      const others = [...document.querySelectorAll<HTMLElement>('.ui-toast-dismiss')].filter(
        (other) => !element.contains(other),
      )
      const target = others[0] ?? document.getElementById('studio-main')
      // After the commit that removes this toast, so the target is still in the page
      queueMicrotask(() =>
        (target?.isConnected ? target : document.getElementById('studio-main'))?.focus(),
      )
    }
  }, [root])
}

interface ToastProps {
  entry: ToastEntry
  /** The timer ran out */
  onExpire: () => void
  onDismiss: () => void
}

const TONE_ICON = { success: CircleCheck, error: CircleAlert } as const

/** A toast: an icon for its tone, never colour alone; Esc dismisses it while it holds focus */
function Toast({ entry, onExpire, onDismiss }: ToastProps): ReactElement {
  const setPaused = useDismissTimer(entry.tone, onExpire)
  const root = useRef<HTMLDivElement>(null)
  useFocusHandOver(root)
  const Icon = TONE_ICON[entry.tone]
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer or focus resting on a toast pauses its timer; Esc dismisses it
    <div
      ref={root}
      className={`ui-toast ui-toast--${entry.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onDismiss()
      }}
    >
      <Icon className="ui-toast-icon" aria-hidden="true" />
      <p className="ui-toast-text">{entry.text}</p>
      <button type="button" className="ui-toast-dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  )
}

function ToastList({
  entries,
  dismiss,
}: {
  entries: readonly ToastEntry[]
  dismiss: (id: number) => void
}): ReactElement[] {
  return entries.map((entry) => (
    <Toast
      key={entry.id}
      entry={entry}
      onExpire={() => dismiss(entry.id)}
      onDismiss={() => dismiss(entry.id)}
    />
  ))
}

/**
 * Holds the toasts of every screen inside it, so a toast outlives the screen
 * that raised it (a save that navigates). Both regions are always in the page,
 * so what enters them is announced: a success politely, an error at once.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)
  const show = useCallback(({ text, tone = 'success' }: ToastInput) => {
    nextId.current += 1
    const entry = { id: nextId.current, text, tone }
    setToasts((current) => [...current, entry].slice(-MAX_TOASTS))
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ui-toasts">
        <div className="ui-toast-region" role="status" aria-label="Notifications">
          <ToastList entries={toasts.filter((t) => t.tone === 'success')} dismiss={dismiss} />
        </div>
        <div className="ui-toast-region" role="alert" aria-label="Errors">
          <ToastList entries={toasts.filter((t) => t.tone === 'error')} dismiss={dismiss} />
        </div>
      </div>
    </ToastContext.Provider>
  )
}
