import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/fetch.js'
import { type Loaded, useLoaded } from '../site/use-loaded.js'
import {
  loadSiteFindings,
  loadStructureBase,
  type SiteFindings,
  type StructureBase,
} from './structure-sources.js'

export interface StructureState {
  base: Loaded<StructureBase>
  findings: Loaded<SiteFindings>
  /** Read every live page's findings again: the answer, or null when it could not be read */
  validate: () => Promise<SiteFindings | null>
  /** Read the SEO configuration and the findings again, after a save */
  reloadBase: () => void
  /** Moves on each time the findings or the configuration are read again; a tab's own sources follow it */
  revision: number
}

const FINDINGS_FAILURE = "The live pages' findings could not be read"

/** The findings, read once and again on request; a new reading keeps the old one on screen */
function useFindings(): Pick<StructureState, 'findings'> & {
  read: () => Promise<SiteFindings | null>
} {
  const [findings, setFindings] = useState<Loaded<SiteFindings>>({ state: 'loading' })
  const alive = useRef(true)
  const read = useCallback(async (): Promise<SiteFindings | null> => {
    try {
      const data = await loadSiteFindings()
      if (alive.current) setFindings({ state: 'ready', data })
      return data
    } catch (err: unknown) {
      if (alive.current)
        setFindings({ state: 'error', message: errorMessage(err, FINDINGS_FAILURE) })
      return null
    }
  }, [])
  useEffect(() => {
    alive.current = true
    void read()
    return () => {
      alive.current = false
    }
  }, [read])
  return { findings, read }
}

/** What every Structure tab reads, with Validate and a reading after a save */
export function useStructure(): StructureState {
  const [revision, setRevision] = useState(0)
  const bump = useCallback(() => setRevision((n) => n + 1), [])
  const { loaded: base, reload } = useLoaded(loadStructureBase, 'Structure could not be read')
  const { findings, read } = useFindings()
  const validate = useCallback(async (): Promise<SiteFindings | null> => {
    const answer = await read()
    bump()
    return answer
  }, [read, bump])
  const reloadBase = useCallback(() => {
    reload()
    void read()
    bump()
  }, [reload, read, bump])
  return { base, findings, validate, reloadBase, revision }
}
