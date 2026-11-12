import { type RefObject, useEffect } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** The elements Tab reaches inside a container, in order */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest('[hidden], [inert]'),
  )
}

function cycle(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return
  const items = focusableIn(container)
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  const active = document.activeElement
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * While active, Tab and Shift+Tab stay inside the container. Focus moves in
 * when it activates (to `initialFocus`, else the first focusable element) and
 * returns to where it was when it deactivates.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = initialFocus?.current ?? focusableIn(container)[0] ?? container
    target.focus()

    const onKeyDown = (event: KeyboardEvent): void => cycle(event, container)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [active, containerRef, initialFocus])
}
