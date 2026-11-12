/**
 * The editor's modes, in the order the header's switcher shows them. Only
 * modes that exist are listed: a mode is added by adding its entry here and
 * the canvas that renders it. The open mode is in the address (`?mode=`), so
 * a link can open one.
 */

/** What the editor edits: a document with a page of its own, or a global (the site's Layout) */
export type EditorKind = 'page' | 'global'

export type EditorModeId = 'live' | 'structure' | 'data' | 'fields' | 'where'

export interface EditorMode {
  id: EditorModeId
  label: string
}

const MODES: Readonly<Record<EditorKind, readonly EditorMode[]>> = {
  // Live first: a page opens on the site's own draft preview
  page: [
    { id: 'live', label: 'Live' },
    { id: 'structure', label: 'Structure' },
    { id: 'data', label: 'Data' },
  ],
  // A global has no page: its fields, and where it appears instead of a Live or Data mode
  global: [
    { id: 'fields', label: 'Fields' },
    { id: 'where', label: 'Where it appears' },
  ],
}

/** The search parameter that holds the open mode */
export const MODE_PARAM = 'mode'

/**
 * The modes of an editor. A document whose collection renders no pages
 * (`path: false`) has no page to show, so it has no Live mode — Structure and
 * Data only, like a page without a preview.
 */
export function editorModes(kind: EditorKind, hasPage = true): readonly EditorMode[] {
  const modes = MODES[kind]
  return hasPage ? modes : modes.filter((mode) => mode.id !== 'live')
}

/** What decides the mode an editor opens in, besides the address */
export interface ModeContext {
  /** A new document: it has no page to preview until it is saved */
  isNew?: boolean | undefined
  /** The collection renders pages (`pages` of `GET /api/collections`); true unless said otherwise */
  hasPage?: boolean | undefined
}

/**
 * The mode an address asks for, when the editor has it; otherwise its first.
 * A new document opens in Structure mode instead of Live.
 */
export function modeFromParam(
  value: string | null,
  kind: EditorKind,
  context: ModeContext = {},
): EditorModeId {
  const modes = editorModes(kind, context.hasPage ?? true)
  const asked = modes.find((mode) => mode.id === value)
  if (asked) return asked.id
  const first = modes[0]?.id ?? 'structure'
  return first === 'live' && context.isNew ? 'structure' : first
}
