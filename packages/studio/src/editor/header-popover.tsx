import { ChevronDown, type LucideIcon } from 'lucide-react'
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { type ChipTone, chipClass } from '../ui/chip.js'

export interface HeaderPopoverProps {
  /** What the chip says */
  label: string
  tone: ChipTone
  icon?: LucideIcon | undefined
  /** The detail, shown under the chip while open; a function gets `dismiss`, which closes it and refocuses the chip */
  children: ReactNode | ((dismiss: () => void) => ReactNode)
}

/** The space kept between an open panel and the viewport's edges */
const EDGE_PX = 16

/**
 * How far to move a panel so it sits inside the viewport: right when it
 * starts left of the edge, left when it ends past the other one
 */
export function clampShift(left: number, right: number, viewport: number): number {
  if (left < EDGE_PX) return EDGE_PX - left
  if (right > viewport - EDGE_PX) return Math.max(EDGE_PX - left, viewport - EDGE_PX - right)
  return 0
}

/** Keeps the open panel on-screen: anchored to its chip, moved inward when it would overflow */
function useOnScreen(open: boolean, panel: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const element = panel.current
    if (!open || !element) return
    element.style.translate = ''
    const { left, right } = element.getBoundingClientRect()
    const shift = clampShift(left, right, window.innerWidth)
    if (shift !== 0) element.style.translate = `${shift}px 0`
  }, [open, panel])
}

/** Closes the panel on a press outside it */
function useOutsidePress(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent): void {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, ref, close])
}

interface Disclosure {
  open: boolean
  toggle: () => void
  dismiss: () => void
  wrapperRef: RefObject<HTMLDivElement | null>
  buttonRef: RefObject<HTMLButtonElement | null>
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onBlur: (event: FocusEvent<HTMLDivElement>) => void
}

/** Open state, and the ways it closes: Esc and dismiss refocus the chip; a press or focus outside just closes */
function useDisclosure(): Disclosure {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsidePress(open, wrapperRef, close)
  const dismiss = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    dismiss()
  }
  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
  }
  const toggle = (): void => setOpen((shown) => !shown)
  return { open, toggle, dismiss, wrapperRef, buttonRef, onKeyDown, onBlur }
}

/**
 * A chip that opens its detail: a disclosure button, so the detail is reached
 * by keyboard and pointer alike and stays until dismissed (Esc, a press
 * outside, or focus moving on) — never a hover-only tooltip.
 */
export function HeaderPopover({
  label,
  tone,
  icon: Icon,
  children,
}: HeaderPopoverProps): ReactElement {
  const { open, toggle, dismiss, wrapperRef, buttonRef, onKeyDown, onBlur } = useDisclosure()
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useOnScreen(open, panelRef)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc and focus leaving close the panel, from wherever inside it they happen
    <div ref={wrapperRef} className="editor-popover" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className={chipClass(tone, 'editor-chip-button')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        {Icon && <Icon className="ui-chip-icon" aria-hidden="true" />}
        {label}
        <ChevronDown className="ui-chip-icon editor-chip-caret" aria-hidden="true" />
      </button>
      <div ref={panelRef} id={panelId} className="editor-popover-panel" hidden={!open}>
        {typeof children === 'function' ? children(dismiss) : children}
      </div>
    </div>
  )
}
