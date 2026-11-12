import { useCallback, useMemo, useState } from 'react'
import type { ContentItem, JsonSchemaProperty } from '../lib/api-types.js'
import { type Draft, rebaseDraft, sameDraft } from './editor-model.js'

/** The fields a new document starts with: each schema default */
export function defaultFields(
  properties: Readonly<Record<string, JsonSchemaProperty>>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (property.default !== undefined) fields[name] = property.default
  }
  return fields
}

/** The draft a document opens with: what is saved, or a new document's defaults */
export function draftOf(document: ContentItem | null, defaults: Record<string, unknown>): Draft {
  return document
    ? {
        fields: document.fields,
        body: document.body,
        metadata: document.metadata,
        ...(document.defaults.length ? { defaults: document.defaults } : {}),
      }
    : { fields: defaults, body: '', metadata: {} }
}

export interface DraftState {
  draft: Draft
  /** What is saved: unsaved changes are the difference from it */
  baseline: Draft
  dirty: boolean
  setMetadata: (metadata: Draft['metadata']) => void
  setField: (name: string, value: unknown) => void
  setBody: (body: string) => void
  /** Replace the work, keeping the baseline: restoring kept work */
  replace: (draft: Draft) => void
  /** A new baseline and the work reset to it: after a version restore */
  reset: (saved: Draft) => void
  /** A new baseline after a save or publish; what changed since `sent` was sent stays */
  rebase: (saved: Draft, sent: Draft) => void
}

/** The form's work against what is saved; dirty when they differ */
export function useDraft(initial: Draft): DraftState {
  const [baseline, setBaseline] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const dirty = useMemo(() => !sameDraft(draft, baseline), [draft, baseline])

  const setField = useCallback((name: string, value: unknown) => {
    setDraft((current) => {
      const fields = { ...current.fields }
      if (value === undefined) delete fields[name]
      else fields[name] = value
      return { ...current, fields }
    })
  }, [])
  const setMetadata = useCallback((metadata: Draft['metadata']) => {
    setDraft((current) => ({ ...current, metadata }))
  }, [])
  const setBody = useCallback((body: string) => {
    setDraft((current) => ({ ...current, body }))
  }, [])
  const reset = useCallback((saved: Draft) => {
    setBaseline(saved)
    setDraft(saved)
  }, [])
  const rebase = useCallback((saved: Draft, sent: Draft) => {
    setBaseline(saved)
    setDraft((current) => rebaseDraft(current, sent, saved))
  }, [])
  return {
    draft,
    baseline,
    dirty,
    setField,
    setBody,
    setMetadata,
    replace: setDraft,
    reset,
    rebase,
  }
}
