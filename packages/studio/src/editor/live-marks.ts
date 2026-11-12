import { DOCUMENT_MARK, FIELD_MARK, SECTION_MARK } from '@krantho/core/marks'
import { LEAD_SECTION } from '@krantho/core/sections'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { CollectionSchema } from '../lib/api-types.js'
import type { Draft } from './editor-model.js'
import { fieldKind } from './field-model.js'
import { isDesigned } from './side-panel/page-sections.js'

/**
 * Live mode's reading of the site's draft preview: the preview-only marks
 * (`@krantho/core/marks`) on the elements that render the edited document's
 * fields and sections, where those elements are, and the patches typing makes
 * to them. Pure DOM logic on the frame's document, read from the parent — no
 * React, and nothing is injected into the page.
 */

/**
 * What a mark names: a field, a `##` section, or the lead. A section is its
 * heading as written; `occurrence` is its place among the marks with that
 * heading in the body's own render (`markBodySections`), and null for a mark
 * outside it — a section rendered on its own (`kranthoSection`) — or before
 * the body has been read. Which body section a mark is follows from the body
 * (`live-sections.ts`).
 */
export type MarkTarget =
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'section'; readonly heading: string; readonly occurrence: number | null }
  | { readonly kind: 'lead' }

/** A marked element of the edited document, and what it renders */
export interface FoundMark {
  readonly element: Element
  readonly target: MarkTarget
}

/** What Live mode found on the page: field names, and section headings as marked (the lead as `__lead`) */
export interface LiveFound {
  readonly fields: ReadonlySet<string>
  readonly sections: ReadonlySet<string>
}

/** An element's box in the frame's viewport */
export interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** The value of `data-krantho-document` for a document: `<collection>/<slug>` */
export function documentMark(collection: string, slug: string): string {
  return `${collection}/${slug}`
}

/**
 * Every marked element of the document, in page order; marks of other
 * documents are left out. Sections come with no occurrence: which of them
 * are the body's own render follows from the body (`numberBodySections`).
 */
export function scanMarks(doc: Document, documentId: string): FoundMark[] {
  const found: FoundMark[] = []
  for (const element of doc.querySelectorAll(`[${DOCUMENT_MARK}]`)) {
    if (element.getAttribute(DOCUMENT_MARK) !== documentId) continue
    const field = element.getAttribute(FIELD_MARK)
    const section = element.getAttribute(SECTION_MARK)
    if (field) found.push({ element, target: { kind: 'field', name: field } })
    else if (section === LEAD_SECTION) found.push({ element, target: { kind: 'lead' } })
    else if (section) {
      found.push({ element, target: { kind: 'section', heading: section, occurrence: null } })
    }
  }
  return found
}

/** Whether an element generates no box of its own (`display: contents`), as `markBodySections`' wrappers do */
export function generatesNoBox(element: Element): boolean {
  const view = element.ownerDocument.defaultView
  return view?.getComputedStyle(element).display === 'contents'
}

/** The element an event happened on: the node itself, or a text node's parent */
function elementOf(node: unknown): Element | null {
  if (!node || typeof node !== 'object') return null
  // The frame's nodes come from another realm, so `instanceof Element` cannot tell
  const candidate = node as { closest?: unknown; parentElement?: Element | null }
  if (typeof candidate.closest === 'function') return node as Element
  return candidate.parentElement ?? null
}

/** Whether an element carries a field or section mark of the document */
function marksDocument(element: Element, documentId: string): boolean {
  if (element.getAttribute(DOCUMENT_MARK) !== documentId) return false
  return element.hasAttribute(FIELD_MARK) || element.hasAttribute(SECTION_MARK)
}

/** The nearest marked element of the document around an event's target, passing other documents' marks */
export function markElementAt(node: unknown, documentId: string): Element | null {
  const selector = `[${DOCUMENT_MARK}]`
  let at = elementOf(node)?.closest(selector) ?? null
  while (at && !marksDocument(at, documentId)) at = at.parentElement?.closest(selector) ?? null
  return at
}

/** A key that is the same for every element rendering the same field, and unique per section */
export function markKey(target: MarkTarget): string {
  if (target.kind === 'field') return `field:${target.name}`
  if (target.kind === 'section') return `section:${target.occurrence ?? 'own'}:${target.heading}`
  return 'lead'
}

function unionOf(boxes: readonly (Box | null)[]): Box | null {
  const present = boxes.filter((box): box is Box => box !== null)
  if (present.length === 0) return null
  const top = Math.min(...present.map((box) => box.top))
  const left = Math.min(...present.map((box) => box.left))
  const bottom = Math.max(...present.map((box) => box.top + box.height))
  const right = Math.max(...present.map((box) => box.left + box.width))
  return { top, left, width: right - left, height: bottom - top }
}

/**
 * Where an element sits in the frame's viewport. A `display: contents`
 * wrapper (`markBodySections`) has no box of its own: its box is the union of
 * its children's, read the same way. An empty box counts as none.
 */
export function markBox(element: Element): Box | null {
  if (generatesNoBox(element)) {
    return unionOf([...element.children].map(markBox))
  }
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

/** The tag an outline shows: "field · title", "section · Approach · designed" or "· prose", "section · lead" */
export function markTag(target: MarkTarget, designed: readonly string[]): string {
  if (target.kind === 'field') return `field · ${target.name}`
  if (target.kind === 'lead') return 'section · lead'
  const kind = isDesigned(target.heading, designed) ? 'designed' : 'prose'
  return `section · ${target.heading} · ${kind}`
}

/** What the marks found: the fields and the sections the page marks for the document */
export function foundOf(marks: readonly FoundMark[]): LiveFound {
  const fields = new Set<string>()
  const sections = new Set<string>()
  for (const { target } of marks) {
    if (target.kind === 'field') fields.add(target.name)
    else sections.add(target.kind === 'lead' ? LEAD_SECTION : target.heading)
  }
  return { fields, sections }
}

/** How a field is edited in place: a text field in an inline editor; media and other fields only after Save */
export function inPlaceKind(
  name: string,
  schema: CollectionSchema,
  draft: Draft,
): 'text' | 'media' | 'other' {
  const property = schema.schema.properties?.[name]
  if (!property) return typeof draft.fields[name] === 'string' ? 'text' : 'other'
  const kind = fieldKind(property, name)
  if (kind === 'media') return 'media'
  return kind === 'text' || kind === 'textarea' ? 'text' : 'other'
}

/** Whether a text field takes line breaks: the form edits it in a textarea */
export function isMultiline(name: string, schema: CollectionSchema): boolean {
  const property = schema.schema.properties?.[name]
  return property !== undefined && fieldKind(property, name) === 'textarea'
}

/** A field's new text, set on every element that renders it */
export function patchText(elements: readonly Element[], text: string): void {
  for (const element of elements) element.textContent = text
}

/** Markdown rendered as the body preview renders it (marked), sanitized by DOMPurify */
function renderMarkdown(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }))
}

/**
 * A section's new markdown, rendered into the element that renders it — an
 * approximation of the site's own rendering until Save. The `##` heading is
 * rendered too when the element renders it (its first child is an `h2`).
 */
export function patchSection(element: Element, markdown: string, heading: string | null): void {
  const withHeading = heading !== null && element.firstElementChild?.tagName === 'H2'
  element.innerHTML = renderMarkdown(withHeading ? `## ${heading}\n\n${markdown}` : markdown)
}
