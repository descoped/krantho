/**
 * Preview-only marks that tell Studio's Live mode which element renders which
 * field or section of which document. Outside a preview every helper returns
 * nothing, so visitors get exactly the markup they always get. Pure, so a
 * browser bundle can use it on its own (`@krantho/core/marks`).
 */

import { LEAD_SECTION, splitSections } from './sections.js'

/** The document a marked value belongs to: `<collection>/<slug>` */
export const DOCUMENT_MARK = 'data-krantho-document'
/** The field an element renders */
export const FIELD_MARK = 'data-krantho-field'
/** The `##` section an element renders, by its heading as written; the lead is `__lead` */
export const SECTION_MARK = 'data-krantho-section'

/** The document a value belongs to, and whether the render is an editor's preview */
export interface MarkedDocument {
  readonly collection: string
  readonly slug: string
  readonly preview?: boolean | undefined
}

/** Attributes to spread on an element; empty outside a preview */
export type KranthoMarks = Readonly<
  Partial<Record<typeof DOCUMENT_MARK | typeof FIELD_MARK | typeof SECTION_MARK, string>>
>

const NONE: KranthoMarks = Object.freeze({})

function marks(
  doc: MarkedDocument | null | undefined,
  name: typeof FIELD_MARK | typeof SECTION_MARK,
  value: string,
): KranthoMarks {
  if (!doc?.preview) return NONE
  return { [DOCUMENT_MARK]: `${doc.collection}/${doc.slug}`, [name]: value }
}

/** Marks for the element that renders a document field */
export function kranthoField(doc: MarkedDocument | null | undefined, field: string): KranthoMarks {
  return marks(doc, FIELD_MARK, field)
}

/** Marks for the element that renders a `##` section (its heading as written), or the lead (`LEAD_SECTION`) */
export function kranthoSection(
  doc: MarkedDocument | null | undefined,
  heading: string,
): KranthoMarks {
  return marks(doc, SECTION_MARK, heading)
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** The marks as HTML attributes for a server template — ` data-krantho-…="…"`, escaped — or `''` */
export function markAttributes(marks: KranthoMarks): string {
  return Object.entries(marks)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value ?? '')}"`)
    .join('')
}

/** A wrapper that marks its content and generates no box, so the layout stays the page's own */
function wrap(content: string, sectionMarks: KranthoMarks): string {
  return `<div${markAttributes(sectionMarks)} style="display:contents">${content}</div>`
}

/**
 * A whole rendered body, its lead and each `##` section wrapped in a
 * `display: contents` element carrying the section's marks. The nth `<h2` of
 * the HTML is paired with the nth heading of the markdown body; when the
 * counts differ — a raw HTML heading, a `##` inside a blockquote — the HTML is
 * returned unmarked. Outside a preview the HTML is returned as it is.
 */
export function markBodySections(
  html: string,
  body: string,
  doc: MarkedDocument | null | undefined,
): string {
  if (!doc?.preview) return html
  const starts = [...html.matchAll(/<h2[\s>]/g)].map((match) => match.index)
  const { sections } = splitSections(body)
  if (starts.length !== sections.length) return html

  const lead = html.slice(0, starts[0] ?? html.length)
  const parts = lead.trim() === '' ? [] : [wrap(lead, kranthoSection(doc, LEAD_SECTION))]
  sections.forEach((section, index) => {
    const content = html.slice(starts[index], starts[index + 1] ?? html.length)
    parts.push(wrap(content, kranthoSection(doc, section.heading)))
  })
  return parts.join('')
}
