import { type KeyboardEvent, type PointerEvent, type ReactElement, useRef } from 'react'
import './resize-handle.css'

export interface ResizeHandleProps {
  /** The handle's accessible name: what it resizes */
  label: string
  value: number
  min: number
  max: number
  /** Which way a drag grows the column: a column on the left grows to the right */
  grows: 'right' | 'left'
  onChange: (width: number) => void
  /** A double click: back to the default width */
  onReset: () => void
  /** The id of the column it resizes */
  controls?: string | undefined
}

/** One arrow key moves the edge this far, in pixels; with Shift, four times as far */
const STEP = 16

function clamp(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width))
}

/**
 * The edge between two columns, which a drag or the arrow keys move. A drag is
 * captured by the handle, so it holds over a frame; Home and End go to the
 * smallest and largest width.
 */
export function ResizeHandle(props: ResizeHandleProps): ReactElement {
  const { label, value, min, max, grows, onChange, onReset, controls } = props
  const sign = grows === 'right' ? 1 : -1
  // The drag's start lives across the renders each move causes
  const drag = useRef<{ x: number; width: number } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    const element = event.currentTarget
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width: value }
    document.body.dataset.resizing = 'true'
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current
    if (start) onChange(clamp(start.width + sign * (event.clientX - start.x), min, max))
  }
  function onPointerEnd(): void {
    drag.current = null
    delete document.body.dataset.resizing
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? STEP * 4 : STEP
    const edge: Record<string, number> = { ArrowRight: step, ArrowLeft: -step }
    if (event.key === 'Home') onChange(min)
    else if (event.key === 'End') onChange(max)
    else if (event.key in edge) onChange(clamp(value + sign * (edge[event.key] ?? 0), min, max))
    else return
    event.preventDefault()
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter is a separator with a value; <hr> takes no focus or value
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-controls={controls}
      tabIndex={0}
      className="resize-handle"
      data-edge={grows}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  )
}
