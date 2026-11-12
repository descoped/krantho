import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { fetchContent, fetchSchema, saveRuntimeField } from '../lib/api.js'
import type { CollectionSchema, ContentItem, RuntimeFieldDefinition } from '../lib/api-types.js'
import { useAuth } from '../lib/auth.js'
import { errorMessage } from '../lib/fetch.js'
import { editorPath } from '../lib/paths.js'
import { useToast } from '../ui/toast.js'
import type { Draft } from './editor-model.js'
import type { HeaderFacts } from './header-model.js'
import { autosaveKey, newDocumentKey } from './kept-work.js'
import { MODE_PARAM } from './modes.js'
import { type Autosave, useAutosave } from './use-autosave.js'
import { type DocumentState, useDocument } from './use-document.js'
import type { DraftState } from './use-draft.js'
import { type EditLock, useEditLock } from './use-edit-lock.js'
import { type EditorActions, useEditorActions } from './use-editor-actions.js'
import type { EditorSource, EditorTarget } from './use-editor-source.js'
import { type LeaveGuard, useLeaveGuard } from './use-leave-guard.js'
import { type NewSlugState, useNewSlug } from './use-new-slug.js'

/** The open document and everything the editor does with it */
export interface Workspace {
  schema: CollectionSchema
  /** The saved document; null until a new one is saved */
  document: ContentItem | null
  draft: DraftState
  newSlug: NewSlugState
  lock: EditLock
  autosave: Autosave
  actions: EditorActions
  guard: LeaveGuard
  canEdit: boolean
  /** Admins also restore versions and promote custom fields, which the API allows them only */
  isAdmin: boolean
  /** A new document is being created: the form waits, so nothing typed is left behind */
  creating: boolean
  /** Inputs are disabled: the role cannot edit, someone else holds the lock, or the document is being created */
  readOnly: boolean
  facts: HeaderFacts
  /** The saved version the work is based on */
  baseVersion: number | null
  /** The fields the document was opened with: a global's rows */
  openedFields: readonly string[]
  setField: (name: string, value: unknown) => void
  /** Put the work kept from an earlier visit back in the form */
  restoreKept: () => void
  promote: (name: string, value: unknown) => Promise<void>
  /** Read the saved document again, replacing the form: after a restore */
  reloadDocument: () => Promise<void>
  prepareSnapshot: (snapshot: Draft) => void
}

function inferType(value: unknown): RuntimeFieldDefinition['type'] {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value !== 'string') return 'string'
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  if (/^https?:\/\//.test(value)) return 'url'
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'email'
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color'
  return 'string'
}

/** The schema, kept current: Promote adds a custom field to the collection's runtime schema */
function useSchema(
  collection: string,
  initial: CollectionSchema,
): [CollectionSchema, (name: string, value: unknown) => Promise<void>] {
  const [schema, setSchema] = useState(initial)
  const toast = useToast()
  const promote = useCallback(
    async (name: string, value: unknown): Promise<void> => {
      try {
        await saveRuntimeField(collection, { name, type: inferType(value), required: false })
        setSchema(await fetchSchema(collection))
        toast({ text: `${name} is now a field of the schema.` })
      } catch (err: unknown) {
        toast({ text: errorMessage(err, `${name} could not be promoted`), tone: 'error' })
      }
    },
    [collection, toast],
  )
  return [schema, promote]
}

/** A field change: into the draft, and — for a new document — a title suggests the slug */
function useSetField(draft: DraftState, newSlug: NewSlugState): Workspace['setField'] {
  const { setField } = draft
  const { suggestFrom } = newSlug
  return useCallback(
    (name: string, value: unknown) => {
      setField(name, value)
      suggestFrom(name, value)
    },
    [setField, suggestFrom],
  )
}

/** Where the open document's unsaved work is kept: its version's own slot, or the collection's new-document slot */
function keyFor(target: EditorTarget, document: ContentItem | null): string {
  if (!document) return newDocumentKey(target.collection, target.locale)
  const { slug, locale } = document.meta
  return autosaveKey(target.collection, slug, locale)
}

/** Whether there is unsaved work: the draft, and for a new document a typed slug */
function hasUnsavedWork(doc: DocumentState, newSlug: NewSlugState): boolean {
  return doc.draft.dirty || (doc.document === null && newSlug.value.trim() !== '')
}

/** The guards around the work: the edit lock, the kept work and leaving */
function useGuards(target: EditorTarget, doc: DocumentState, newSlug: NewSlugState) {
  const canEdit = useAuth().hasRole('editor')
  const meta = doc.document?.meta
  const lockTarget =
    canEdit && meta ? { collection: target.collection, slug: meta.slug, locale: meta.locale } : null
  const lock = useEditLock(lockTarget)
  const dirty = hasUnsavedWork(doc, newSlug)
  const autosave = useAutosave({
    key: keyFor(target, doc.document),
    draft: doc.draft.draft,
    dirty,
    opened: doc.opened,
    context: {
      baseVersion: doc.baseVersion ?? undefined,
      slug: doc.document ? undefined : newSlug.value,
    },
  })
  return { canEdit, lock, autosave, dirty, guard: useLeaveGuard(dirty) }
}

/** Save and publish for this document; a new document moves to its own address once created */
function useActions(
  target: EditorTarget,
  doc: DocumentState,
  newSlug: NewSlugState,
  guards: { guard: LeaveGuard; autosave: Autosave },
): EditorActions {
  const navigate = useNavigate()
  const { collection, locale } = target
  const { release } = guards.guard
  const { forget } = guards.autosave
  const onCreated = useCallback(
    (slug: string) => {
      // Created: the new-document slot is done with, and leaving is no longer guarded
      forget()
      release()
      // It was made in Structure mode, and stays there: its page is new
      const path = editorPath(collection, slug, locale)
      navigate(`${path}${path.includes('?') ? '&' : '?'}${MODE_PARAM}=structure`)
    },
    [forget, release, navigate, collection, locale],
  )
  return useEditorActions({
    collection,
    saved: doc.document,
    baseVersion: doc.baseVersion,
    newLocale: locale,
    draft: doc.draft.draft,
    newSlug: newSlug.value,
    onSaved: doc.onSaved,
    onReplaced: doc.onReplaced,
    onCreated,
  })
}

/**
 * Who else is editing: the lock as last read, or — until the lock is read
 * again — the holder named by a save the lock refused
 */
function lockHolder(lock: EditLock, actions: EditorActions): string | null {
  if (lock.state === 'foreign') return lock.holder
  if (lock.state === 'held') return null
  return actions.failure?.lockedBy ?? null
}

/** What the header's state rests on */
function headerFacts(
  doc: DocumentState,
  dirty: boolean,
  actions: EditorActions,
  canEdit: boolean,
  lockedBy: string | null,
): HeaderFacts {
  const meta = doc.document?.meta
  return {
    saved: meta ? { version: meta.version, liveVersion: meta.liveVersion } : null,
    dirty,
    busy: actions.busy !== null,
    canEdit,
    lockedBy,
    rebased: meta !== undefined && doc.baseVersion !== meta.version,
    conflict: actions.failure?.conflictWith !== undefined,
  }
}

/** Restore kept work: into the form, a new document's slug too, on the version it was made on */
function useRestore(doc: DocumentState, newSlug: NewSlugState, autosave: Autosave): () => void {
  const { replace } = doc.draft
  const { restoredOn } = doc
  const { onChange } = newSlug
  const { restore } = autosave
  return useCallback(() => {
    const kept = restore()
    if (!kept) return
    replace({
      fields: kept.fields,
      body: kept.body,
      metadata: kept.metadata,
      defaults: kept.defaults,
    })
    restoredOn(kept.baseVersion)
    if (kept.slug) onChange(kept.slug)
  }, [restore, replace, restoredOn, onChange])
}

export function useWorkspace(source: EditorSource, target: EditorTarget): Workspace {
  const { collection } = target
  const [schema, promote] = useSchema(collection, source.schema)
  const doc = useDocument(source)
  const { document, draft, onReplaced } = doc
  const newSlug = useNewSlug()
  const { canEdit, lock, autosave, dirty, guard } = useGuards(target, doc, newSlug)
  const actions = useActions(target, doc, newSlug, { guard, autosave })
  const lockedBy = lockHolder(lock, actions)
  const isAdmin = useAuth().hasRole('admin')
  const creating = document === null && actions.busy === 'save'
  const meta = document?.meta
  const reloadDocument = useCallback(async () => {
    if (meta) onReplaced(await fetchContent(collection, meta.slug, meta.locale))
  }, [collection, meta, onReplaced])
  return {
    prepareSnapshot: (snapshot) => draft.replace(snapshot),
    schema,
    document,
    draft,
    newSlug,
    lock,
    autosave,
    actions,
    guard,
    canEdit,
    isAdmin,
    creating,
    readOnly: !canEdit || lockedBy !== null || creating,
    facts: headerFacts(doc, dirty, actions, canEdit, lockedBy),
    baseVersion: doc.baseVersion,
    openedFields: doc.openedFields,
    setField: useSetField(draft, newSlug),
    restoreKept: useRestore(doc, newSlug, autosave),
    promote,
    reloadDocument,
  }
}
