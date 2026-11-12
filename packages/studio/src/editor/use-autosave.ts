import { useCallback, useEffect, useRef, useState } from 'react'
import type { Draft } from './editor-model.js'
import {
  canKeepWork,
  clearAutosave,
  type Keeping,
  type KeptContext,
  readAutosave,
  type StoredDraft,
  worthOffering,
  writeAutosave,
} from './kept-work.js'

/** Unsaved work is kept this long after the last change */
const KEEP_AFTER_MS = 800

export interface AutosaveInput {
  /** Where the work is kept; null keeps nothing */
  key: string | null
  draft: Draft
  dirty: boolean
  /** What the document opened with: kept work equal to it is not offered */
  opened: Draft
  /** Kept beside the draft: the version it is based on, a new document's slug */
  context: KeptContext
}

export interface Autosave {
  /** Work kept from an earlier visit, waiting for Restore or Discard; null when there is none */
  offer: StoredDraft | null
  /** Whether what is typed now is kept, and if not, why */
  keeping: Keeping
  /** Take the kept work back; the caller puts it in the form */
  restore: () => StoredDraft | null
  /** Throw the kept work away */
  discard: () => void
  /** The work is saved for good (a created document): keep nothing more under this key */
  forget: () => void
}

/** Latest values, for the write that runs as the editor closes */
interface Latest {
  input: AutosaveInput
  offer: StoredDraft | null
  forgotten: boolean
}

/** Keep the work a moment after each change; clear the slot once nothing is unsaved */
function useKeepWhileEditing(
  input: AutosaveInput,
  offer: StoredDraft | null,
  latest: Latest,
): void {
  const { key, draft, dirty, context } = input
  const { baseVersion, slug } = context
  useEffect(() => {
    // An open offer keeps its slot until it is answered
    if (!key || offer || latest.forgotten) return
    if (!dirty) {
      clearAutosave(key)
      return
    }
    const timer = setTimeout(() => writeAutosave(key, draft, { baseVersion, slug }), KEEP_AFTER_MS)
    return () => clearTimeout(timer)
  }, [key, draft, dirty, baseVersion, slug, offer, latest])
}

/**
 * Leaving with unsaved work keeps it at once — unless an offer still holds the slot.
 * Leaving the page (a reload, a closed tab, an address typed) keeps it as the page
 * goes: the editor may still be open then, even after Studio moved to another
 * address, and its close would never run.
 */
function useKeepOnClose(key: string | null, latest: Latest): void {
  useEffect(() => {
    if (!key) return
    const keep = (): void => {
      const { input, offer, forgotten } = latest
      if (input.dirty && !offer && !forgotten) writeAutosave(key, input.draft, input.context)
    }
    window.addEventListener('pagehide', keep)
    return () => {
      window.removeEventListener('pagehide', keep)
      keep()
    }
  }, [key, latest])
}

/**
 * Keeps unsaved work in this browser and offers it back the next time the
 * document opens. Work equal to what opened is not kept; an offer keeps its
 * slot until Restore or Discard, so typing never overwrites earlier work.
 */
export function useAutosave(input: AutosaveInput): Autosave {
  const { key } = input
  // Read once, as the document opens: the editor remounts for another document
  const [offer, setOffer] = useState(() => {
    const kept = key ? readAutosave(key) : null
    return worthOffering(kept, input.opened, input.context.baseVersion !== undefined) ? kept : null
  })
  const [storage] = useState(canKeepWork)
  const latest = useRef<Latest>({ input, offer, forgotten: false }).current
  latest.input = input
  latest.offer = offer
  useKeepWhileEditing(input, offer, latest)
  useKeepOnClose(key, latest)

  const restore = useCallback((): StoredDraft | null => {
    setOffer(null)
    return offer
  }, [offer])
  const discard = useCallback((): void => {
    if (key) clearAutosave(key)
    setOffer(null)
  }, [key])
  const forget = useCallback((): void => {
    latest.forgotten = true
    if (key) clearAutosave(key)
  }, [key, latest])
  const keeping: Keeping = offer ? 'offer-pending' : key && storage ? 'kept' : 'unavailable'
  return { offer, keeping, restore, discard, forget }
}
