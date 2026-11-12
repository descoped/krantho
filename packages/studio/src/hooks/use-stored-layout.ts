import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import { writeLayout } from '../lib/stored-layout.js'

/**
 * A layout the viewer chose, read once and kept in this browser. It is written
 * after a change has rendered, not inside the state update, and never for the
 * value it started with.
 */
export function useStoredLayout<T extends object>(
  key: string,
  read: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [layout, setLayout] = useState<T>(read)
  const stored = useRef(layout)
  useEffect(() => {
    if (layout === stored.current) return
    stored.current = layout
    writeLayout(key, layout)
  }, [key, layout])
  return [layout, setLayout]
}
