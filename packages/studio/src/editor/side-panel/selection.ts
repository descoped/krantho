import { splitSections } from '@krantho/core/sections'

/**
 * What the side panel is about: a field, a `##` section of the body, the lead
 * (the body before its first `##`), or nothing — the page as a whole. Structure
 * mode reports it from where the person is working.
 */
export type PanelSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'field'; readonly name: string }
  /**
   * `index` is the section's place among the body's sections; `heading` as
   * written. `ambiguous`: Live mode selected a mark of a heading the body has
   * more than once, outside the body's own render, so which section it is
   * cannot be told (`index` is -1)
   */
  | {
      readonly kind: 'section'
      readonly heading: string
      readonly index: number
      readonly ambiguous?: boolean | undefined
    }
  | { readonly kind: 'lead' }

export const NOTHING_SELECTED: PanelSelection = { kind: 'none' }

/** Whether two selections are about the same thing */
export function sameSelection(a: PanelSelection, b: PanelSelection): boolean {
  if (a.kind === 'field' && b.kind === 'field') return a.name === b.name
  if (a.kind === 'section' && b.kind === 'section') {
    return a.index === b.index && a.heading === b.heading && !a.ambiguous === !b.ambiguous
  }
  return a.kind === b.kind
}

/**
 * The part of the body a caret sits in: the lead, or the `##` section whose
 * heading or markdown holds it. The body is split by core's own rule
 * (`splitSections`): the text up to the end of the caret's line holds as many
 * sections as precede the caret, the last of them being the caret's.
 */
export function selectionAtCaret(body: string, caret: number): PanelSelection {
  const lineEnd = body.indexOf('\n', Math.max(0, caret))
  const upToLine = lineEnd === -1 ? body : body.slice(0, lineEnd)
  const before = splitSections(upToLine).sections
  const index = before.length - 1
  const own = before[index]
  if (!own) return { kind: 'lead' }
  // The whole body gives the heading as written, even when the caret sits inside it
  const heading = splitSections(body).sections[index]?.heading ?? own.heading
  return { kind: 'section', heading, index }
}

/** How the panel names what it shows: its heading, and what is announced when it changes */
export function selectionTitle(selection: PanelSelection): string {
  switch (selection.kind) {
    case 'field':
      return `Field · ${selection.name}`
    case 'section':
      return `Section · ${selection.heading}`
    case 'lead':
      return 'Lead'
    default:
      return 'Page overview'
  }
}

/**
 * Whether releasing a key in a field's row says the person is working there:
 * a key that types or edits. Esc, Tab, the arrows and the other keys that
 * only move or dismiss never select again — Esc has just returned the panel
 * to the page overview, and Tab has already moved focus on.
 */
export function selectsOnKeyUp(key: string): boolean {
  return key.length === 1 || key === 'Backspace' || key === 'Delete' || key === 'Enter'
}
