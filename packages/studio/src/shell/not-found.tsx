import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router'
import { buttonClass } from '../ui/button.js'

/** The route handle of the not-found screen: the breadcrumbs then name nothing else */
export const NOT_FOUND = { notFound: true } as const

/** Whether a route handle marks the not-found screen */
export function isNotFoundHandle(handle: unknown): boolean {
  return typeof handle === 'object' && handle !== null && 'notFound' in handle
}

interface MissingScreen {
  /** The path of the screen that turned out to be missing, once it knows */
  path: string | null
  report: (path: string | null) => void
}

const MissingScreenContext = createContext<MissingScreen>({ path: null, report: () => {} })

/** Lets a screen that finds its subject missing, after it loaded, tell the breadcrumbs */
export function MissingScreenProvider({ children }: { children: ReactNode }): ReactElement {
  const [path, report] = useState<string | null>(null)
  return (
    <MissingScreenContext.Provider value={{ path, report }}>
      {children}
    </MissingScreenContext.Provider>
  )
}

/** Whether the screen at this path reported itself missing */
export function useIsMissing(pathname: string): boolean {
  return useContext(MissingScreenContext).path === pathname
}

/** An unknown path, or a screen this site or viewer does not have */
export function NotFound(): ReactElement {
  const { pathname } = useLocation()
  const { report } = useContext(MissingScreenContext)
  useEffect(() => {
    report(pathname)
    return () => report(null)
  }, [report, pathname])
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <p className="not-found-code">404</p>
      <h1 id="not-found-title">Nothing here</h1>
      <p>This screen does not exist, or it is turned off for this site or for your role.</p>
      <Link to="/" className={buttonClass('primary')}>
        Go to Pulse
      </Link>
    </section>
  )
}
