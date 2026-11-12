import type { ReactNode, RefObject } from 'react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export interface AssistantToggle {
  /** Whether the panel is showing */
  open: boolean
  /** Whether the panel was ever opened — it stays mounted from then on */
  opened: boolean
  toggle: () => void
  /** Close the panel and return focus to the launcher */
  close: () => void
  launcherRef: RefObject<HTMLButtonElement | null>
}

const AssistantContext = createContext<AssistantToggle | null>(null)

/** The panel's open state and the launcher it returns focus to */
export function AssistantProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const launcherRef = useRef<HTMLButtonElement | null>(null)

  const toggle = useCallback((): void => {
    setOpened(true)
    setOpen((value) => !value)
  }, [])
  const close = useCallback((): void => {
    setOpen(false)
    launcherRef.current?.focus()
  }, [])

  const value = useMemo(
    () => ({ open, opened, toggle, close, launcherRef }),
    [open, opened, toggle, close],
  )
  return <AssistantContext value={value}>{children}</AssistantContext>
}

/** The assistant's toggle, or null when the assistant is not available */
export function useAssistantToggle(): AssistantToggle | null {
  return useContext(AssistantContext)
}
