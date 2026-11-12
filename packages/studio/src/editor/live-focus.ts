import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { quietly, readQuietly } from './live-frame-state.js'
import type { LiveFrame } from './use-live-frame.js'

/**
 * Live mode's frame comes and goes — it reloads, leaves the page, comes back
 * — and the inline editor goes with it. Focus never falls to
 * the page's body on the way: whatever Live mode took away from under focus,
 * it puts focus somewhere that says where things are.
 */

/** Whether focus has been lost: on the page's body, nowhere, or on an element that is gone */
export function focusIsLost(): boolean {
  const active = document.activeElement
  return !active || active === document.body || !active.isConnected
}

/** Whether focus was last inside Live mode: removing the element that held it loses it */
function useFocusInside(
  container: RefObject<HTMLElement | null>,
  frame: LiveFrame,
): RefObject<boolean> {
  const inside = useRef(false)
  const doc =
    frame.state.kind === 'ready' ? readQuietly(() => frame.frameRef.current?.contentDocument) : null
  useEffect(() => {
    const track = (event: FocusEvent): void => {
      const target = event.target
      inside.current = target instanceof Node && (container.current?.contains(target) ?? false)
    }
    document.addEventListener('focusin', track)
    const trackFrame = (): void => {
      inside.current = true
    }
    quietly(() => doc?.addEventListener('focusin', trackFrame))
    return () => {
      document.removeEventListener('focusin', track)
      quietly(() => doc?.removeEventListener('focusin', trackFrame))
    }
  }, [container, doc])
  return inside
}

/**
 * At each change of the frame — it loads, reloads, leaves or fails — and
 * each time the inline editor closes: when focus was in Live mode, or a
 * Reload the preview or Back to the page asked for it (`requested`), and has
 * been lost, it goes to Back to the page while the frame shows another page,
 * else to the frame. A frame that holds focus hands it to its page once the
 * page is shown.
 */
export function useFocusKept(
  container: RefObject<HTMLElement | null>,
  frame: LiveFrame,
  editorOpen: boolean,
  requested: RefObject<boolean>,
): void {
  const inside = useFocusInside(container, frame)
  const phase = `${frame.reload}:${frame.state.kind}:${editorOpen}`
  const last = useRef(phase)
  useLayoutEffect(() => {
    if (phase === last.current) return
    last.current = phase
    const wanted = inside.current || requested.current
    requested.current = false
    if (!wanted || !focusIsLost()) return
    const back = container.current?.querySelector<HTMLElement>('.live-moved button')
    ;(back ?? frame.frameRef.current)?.focus()
  }, [phase, inside, requested, container, frame.frameRef])
  const shown = frame.state.kind === 'ready'
  useEffect(() => {
    const element = frame.frameRef.current
    if (!shown || !element || document.activeElement !== element) return
    quietly(() => element.contentWindow?.focus())
  }, [shown, frame.frameRef])
}
