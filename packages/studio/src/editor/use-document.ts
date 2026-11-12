import { useCallback, useMemo, useState } from 'react'
import type { ContentItem } from '../lib/api-types.js'
import type { Draft } from './editor-model.js'
import { type DraftState, defaultFields, draftOf, useDraft } from './use-draft.js'
import type { EditorSource } from './use-editor-source.js'

/** The saved document, the form's work on it, and the version that work is based on */
export interface DocumentState {
  document: ContentItem | null
  draft: DraftState
  /** The draft the document opened with: kept work equal to it is not offered */
  opened: Draft
  /** The saved version the work is based on; a save sends it, so a newer one is a conflict */
  baseVersion: number | null
  /** The names of the fields the document opened with that hold a value */
  openedFields: readonly string[]
  /** Work kept from an earlier visit was restored: it is based on that version */
  restoredOn: (version: number | undefined) => void
  /** A save or publish answered: the saved copy is the new baseline, later typing stays */
  onSaved: (saved: ContentItem, sent: Draft) => void
  /** A version restore or a publication change replaced the saved document: the form takes it whole */
  onReplaced: (saved: ContentItem) => void
}

export function useDocument(source: EditorSource): DocumentState {
  const [document, setDocument] = useState(source.document)
  const [baseVersion, setBaseVersion] = useState(source.document?.meta.version ?? null)
  const defaults = useMemo(() => defaultFields(source.schema.schema.properties ?? {}), [source])
  const opened = useMemo(() => draftOf(source.document, defaults), [source, defaults])
  const draft = useDraft(opened)
  const openedFields = useMemo(
    () => Object.keys(opened.fields).filter((name) => opened.fields[name] !== undefined),
    [opened],
  )
  const { rebase, reset } = draft
  const onSaved = useCallback(
    (saved: ContentItem, sent: Draft) => {
      setDocument(saved)
      setBaseVersion(saved.meta.version)
      rebase(draftOf(saved, defaults), sent)
    },
    [rebase, defaults],
  )
  const onReplaced = useCallback(
    (saved: ContentItem) => {
      setDocument(saved)
      setBaseVersion(saved.meta.version)
      reset(draftOf(saved, defaults))
    },
    [reset, defaults],
  )
  const restoredOn = useCallback((version: number | undefined) => {
    if (version !== undefined) setBaseVersion(version)
  }, [])
  return { document, draft, opened, openedFields, baseVersion, restoredOn, onSaved, onReplaced }
}
