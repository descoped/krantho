import { splitSections } from '@krantho/core/sections'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CollectionSchema } from '../lib/api-types.js'
import type { Draft } from './editor-model.js'
import { editableInFrame, type Point } from './live-in-place.js'
import { inPlaceKind, type MarkTarget, markKey } from './live-marks.js'
import { placeOfSection } from './live-sections.js'
import { NOTHING_SELECTED, type PanelSelection } from './side-panel/selection.js'

/** What Live mode's selecting and editing in place reads of the editor */
export interface LiveEditingInput {
  schema: CollectionSchema
  draft: Draft
  readOnly: boolean
  /** What the side panel shows: back to nothing selected clears the outline and the editor */
  selection: PanelSelection
  onField: (name: string, value: unknown) => void
  onBody: (body: string) => void
  onSelect: (selection: PanelSelection, focusPanel?: boolean | undefined) => void
}

/** The element a field is edited on in the page itself, and where the click landed */
export interface InPlaceTarget {
  readonly element: HTMLElement
  readonly point: Point | null
}

/** Where a mark was picked: the element, and the click's point when it was a click */
export interface PickedAt {
  readonly element: Element | null
  readonly point: Point | null
}

/** The selected element, the one being edited, and what Live mode says about them */
export interface LiveEditing {
  selected: MarkTarget | null
  /** What is being edited, in the page itself (`inPlace`) or in the inline editor */
  editing: MarkTarget | null
  /** Set when a plain-text field is edited on its element in the page; null for the inline editor */
  inPlace: InPlaceTarget | null
  /** Why the inline editor closed on its own, announced; empty otherwise */
  notice: string
  /** Select a mark as a click does; focus returns to `from` when its editor closes */
  pick: (target: MarkTarget, from: HTMLElement | null, at: PickedAt) => void
  /** Esc or Done in the editor, or Enter in a one-line field in the page: close it, clear the outline, return the panel to nothing selected */
  close: () => void
  /** Esc in the page, or focus leaving the field edited in the page: the same, focus staying where it is */
  dismiss: () => void
  /** Close the inline editor before the body changes from outside it (Add section); the selection stays */
  closeFirst: () => void
  /** The inline editor's own writes to a field */
  onField: (name: string, value: unknown) => void
  /** The inline editor's own writes to the body */
  onBody: (body: string) => void
}

const SECTION_CHANGED = 'The section changed elsewhere; open it again to edit.'
const FIELD_CHANGED = 'The field changed elsewhere; open it again to edit.'

/**
 * The panel's selection for a mark: the field, the lead, or the body section
 * it is, with its heading as the body writes it — or, for a heading the body
 * has more than once that the mark cannot tell apart, the heading alone
 */
function selectionOf(target: MarkTarget, body: string): PanelSelection {
  if (target.kind === 'field') return { kind: 'field', name: target.name }
  if (target.kind === 'lead') return { kind: 'lead' }
  const place = placeOfSection(body, target.heading, target.occurrence)
  if (place.kind === 'ambiguous') {
    return { kind: 'section', heading: target.heading, index: -1, ambiguous: true }
  }
  const index = place.kind === 'index' ? place.index : -1
  const heading = splitSections(body).sections[index]?.heading ?? target.heading
  return { kind: 'section', heading, index }
}

/** Whether a mark opens an inline editor: a text field, the lead, or a section it can tell apart */
function editableInPlace(target: MarkTarget, input: LiveEditingInput): boolean {
  if (input.readOnly) return false
  if (target.kind === 'field') return inPlaceKind(target.name, input.schema, input.draft) === 'text'
  if (target.kind === 'lead') return true
  return placeOfSection(input.draft.body, target.heading, target.occurrence).kind === 'index'
}

/** What the open inline editor writes: its field's value, or the body for a section or the lead */
function watchedOf(editing: MarkTarget | null, draft: Draft): unknown {
  return editing?.kind === 'field' ? draft.fields[editing.name] : draft.body
}

/**
 * The inline editor only ever writes over a value it wrote itself: any other
 * change to it — to the body for a section or the lead (Add section, kept
 * work restored, a rebase, a save that reloads), to the field for a field —
 * closes it before the next keystroke, keeping the selection and saying why.
 * A change that leaves the value as the editor wrote it keeps it open.
 */
function useClosedByOutsideChange(
  draft: Draft,
  editing: MarkTarget | null,
  close: (notice: string) => void,
): (value: unknown) => void {
  const key = editing ? markKey(editing) : null
  const watched = watchedOf(editing, draft)
  const written = useRef({ key, value: watched })
  const notice = editing?.kind === 'field' ? FIELD_CHANGED : SECTION_CHANGED
  useLayoutEffect(() => {
    const was = written.current
    // A newly opened editor starts from the value as it is
    if (key === null || was.key !== key) written.current = { key, value: watched }
    else if (!Object.is(watched, was.value)) close(notice)
  }, [key, watched, notice, close])
  return useCallback((value: unknown) => {
    written.current = { ...written.current, value }
  }, [])
}

/** Back to nothing selected in the panel (Page overview, Esc there) clears the outline and the editor */
function useClearedWithPanel(selection: PanelSelection, clear: () => void): void {
  const nothing = selection.kind === 'none'
  useEffect(() => {
    if (nothing) clear()
  }, [nothing, clear])
}

/** The selected mark, the one being edited and where, and the notice, with the two ways they close */
function useEditingState() {
  const [selected, setSelected] = useState<MarkTarget | null>(null)
  const [edit, setEdit] = useState<{ target: MarkTarget; inPlace: InPlaceTarget | null } | null>(
    null,
  )
  const [notice, setNotice] = useState('')
  /** Close the editor, keeping the selection, and say why (or nothing) */
  const closeOnly = useCallback((why: string) => {
    setEdit(null)
    setNotice(why)
  }, [])
  /** Clear the selection and the editor */
  const clear = useCallback(() => {
    setSelected(null)
    setEdit(null)
  }, [])
  return { selected, setSelected, edit, setEdit, notice, setNotice, closeOnly, clear }
}

/**
 * A field is edited on its element in the page when the element holds only
 * text and that text is the field's value — a page that adds words around the
 * value (a prefix, a unit) would have them typed into the field. Otherwise
 * the inline editor edits it.
 */
function inPlaceOf(target: MarkTarget, at: PickedAt, draft: Draft): InPlaceTarget | null {
  if (!at.element) return null
  if (target.kind !== 'field') {
    const View = at.element.ownerDocument.defaultView
    return View && at.element instanceof View.HTMLElement
      ? { element: at.element, point: at.point }
      : null
  }
  if (!editableInFrame(at.element)) return null
  const value = draft.fields[target.name]
  if (at.element.textContent !== (typeof value === 'string' ? value : '')) return null
  return { element: at.element, point: at.point }
}

/** The inline editor's writes, remembered as its own before they reach the draft */
function ownWrites(
  remember: (value: unknown) => void,
  input: LiveEditingInput,
): Pick<LiveEditing, 'onBody' | 'onField'> {
  return {
    onBody: (body) => {
      remember(body)
      input.onBody(body)
    },
    onField: (name, value) => {
      remember(value)
      input.onField(name, value)
    },
  }
}

/** Live mode's selection on the page and its inline editor, kept in step with the side panel */
export function useLiveEditing(input: LiveEditingInput): LiveEditing {
  const state = useEditingState()
  const { selected, notice, closeOnly, clear } = state
  const editing = state.edit?.target ?? null
  const returnTo = useRef<HTMLElement | null>(null)
  const remember = useClosedByOutsideChange(input.draft, editing, closeOnly)
  useClearedWithPanel(input.selection, clear)
  function pick(target: MarkTarget, from: HTMLElement | null, at: PickedAt): void {
    const editable = editableInPlace(target, input)
    // A click in the field being edited is the person placing the caret
    if (editable && at.element && at.element === state.edit?.inPlace?.element) return
    state.setSelected(target)
    state.setNotice('')
    // An editor takes focus; without one, the panel's heading does
    input.onSelect(selectionOf(target, input.draft.body), !editable)
    returnTo.current = from
    state.setEdit(editable ? { target, inPlace: inPlaceOf(target, at, input.draft) } : null)
  }
  function dismiss(): void {
    clear()
    input.onSelect(NOTHING_SELECTED)
  }
  const close = (): void => {
    dismiss()
    returnTo.current?.focus()
  }
  const closeFirst = useCallback(() => closeOnly(''), [closeOnly])
  const editingNow = input.readOnly ? null : editing
  const inPlace = input.readOnly ? null : (state.edit?.inPlace ?? null)
  const writes = ownWrites(remember, input)
  return {
    selected,
    editing: editingNow,
    inPlace,
    notice,
    pick,
    close,
    dismiss,
    closeFirst,
    ...writes,
  }
}
