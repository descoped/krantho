import { type BodySection, findSection, splitSections } from '@krantho/core/sections'

/**
 * The body measured against the collection's section contract: the `##`
 * sections its page template designs (`sections` of `GET /api/collections`),
 * each present or missing, and the other sections, which render as prose.
 * Sections are split and matched by core's rules (`@krantho/core/sections`):
 * a heading names a designed section regardless of case.
 */

/** A section of the body: its heading as written and its place among the body's sections */
export interface SectionRef {
  readonly heading: string
  readonly index: number
}

/** A designed section, with the body's section that holds it; null when missing */
export interface DesignedSection {
  readonly name: string
  readonly found: SectionRef | null
}

export interface PageSections {
  readonly lead: string
  readonly designed: readonly DesignedSection[]
  /** The sections the contract does not design */
  readonly prose: readonly SectionRef[]
  /** How many designed sections the body has */
  readonly present: number
}

/** Whether a heading names one of the designed sections */
export function isDesigned(heading: string, designed: readonly string[]): boolean {
  const section: BodySection = { heading, markdown: '' }
  return designed.some((name) => findSection([section], name) !== undefined)
}

export function pageSections(body: string, designed: readonly string[]): PageSections {
  const split = splitSections(body)
  const rows = designed.map((name): DesignedSection => {
    const section = findSection(split, name)
    const found = section
      ? { heading: section.heading, index: split.sections.indexOf(section) }
      : null
    return { name, found }
  })
  const prose = split.sections
    .map((section, index) => ({ heading: section.heading, index }))
    .filter((section) => !isDesigned(section.heading, designed))
  return {
    lead: split.lead,
    designed: rows,
    prose,
    present: rows.filter((row) => row.found !== null).length,
  }
}

/** Where each line of the body starts */
function lineStarts(body: string): number[] {
  const starts = [0]
  for (let at = body.indexOf('\n'); at !== -1; at = body.indexOf('\n', at + 1)) {
    starts.push(at + 1)
  }
  return starts
}

/**
 * Where the heading line of the body's section `index` starts. Read by
 * core's own split: the text before a line holds as many sections as precede
 * it, a count that only grows line by line, so the first line whose text up
 * to its end holds `index + 1` sections is that section's heading.
 */
function sectionOffset(body: string, index: number): number {
  const starts = lineStarts(body)
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const lineEnd = (starts[middle + 1] ?? body.length + 1) - 1
    if (splitSections(body.slice(0, lineEnd)).sections.length > index) high = middle
    else low = middle + 1
  }
  return starts[low] ?? body.length
}

/** The body's line break: CRLF when it uses it, else LF */
function lineBreakOf(body: string): '\n' | '\r\n' {
  return body.includes('\r\n') ? '\r\n' : '\n'
}

/** The body with text added at its end, a blank line after what is there */
function appendBlock(body: string, block: string, eol: string): string {
  if (body.trim() === '') return `${body}${block}`
  const gap = body.endsWith(`${eol}${eol}`) ? '' : body.endsWith(eol) ? eol : `${eol}${eol}`
  return `${body}${gap}${block}`
}

/**
 * The body with a missing designed section added as `## <name>`: before the
 * first section the contract places after it, else at the end. Only the
 * heading is inserted, with the body's own line breaks; the rest of the body
 * keeps its bytes. Returns the new section's index among the body's sections.
 */
export function addDesignedSection(
  body: string,
  designed: readonly string[],
  name: string,
): { body: string; index: number } {
  const { sections } = splitSections(body)
  const eol = lineBreakOf(body)
  const later = designed.slice(designed.indexOf(name) + 1)
  const next = sections.findIndex((section) => isDesigned(section.heading, later))
  if (next === -1) {
    return { body: appendBlock(body, `## ${name}${eol}`, eol), index: sections.length }
  }
  const at = sectionOffset(body, next)
  return { body: `${body.slice(0, at)}## ${name}${eol}${eol}${body.slice(at)}`, index: next }
}

/**
 * A part of the body opened for editing in place: the bytes before and after
 * it exactly as found, and its text. Every change is the prefix, the typed
 * text and the suffix — the body is never split again while it is edited, so
 * a typed code fence or `##` heading cannot move or remove another part, and
 * the rest of the body keeps its line breaks and spacing byte for byte.
 */
export interface BodySplice {
  readonly prefix: string
  /** The part's markdown without its surrounding blank space, line breaks as `\n` */
  readonly text: string
  readonly suffix: string
  /** The part's own line break as found, used for what is typed */
  readonly eol: '\n' | '\r\n'
  /** The prefix ends in a heading with no line break after it: text typed there starts on a line of its own */
  readonly breakBefore: boolean
}

/**
 * The line ending of the heading line a part follows, from its `\n` and the
 * character before it: the heading's own when the prefix ends with it, else
 * the previous line's — a last heading with no line break after it. Null for
 * the lead, which follows no heading.
 */
function headingLineBreak(prefix: string): '\n' | '\r\n' | null {
  const at = prefix.endsWith('\n') ? prefix.length - 1 : prefix.lastIndexOf('\n')
  if (at < 0) return null
  return prefix[at - 1] === '\r' ? '\r\n' : '\n'
}

/**
 * The line break typed text takes: the part's own, as found — its text's,
 * else the blank space around it, else the line ending the heading before it
 * — so a part written with LF stays LF in a body that also has CRLF
 */
function regionLineBreak(content: string, region: string, prefix: string): '\n' | '\r\n' {
  for (const text of [content, region]) {
    if (text.includes('\r\n')) return '\r\n'
    if (text.includes('\n')) return '\n'
  }
  return headingLineBreak(prefix) ?? lineBreakOf(prefix)
}

/** The part of the body between two offsets, with its surrounding blank space kept in the prefix and suffix */
function regionSplice(body: string, start: number, end: number, breakBefore: boolean): BodySplice {
  const region = body.slice(start, end)
  const content = region.trim()
  const eol = regionLineBreak(content, region, body.slice(0, start))
  if (content === '') {
    return { prefix: body.slice(0, start), text: '', suffix: body.slice(start), eol, breakBefore }
  }
  const lead = region.length - region.trimStart().length
  const trail = region.length - region.trimEnd().length
  return {
    prefix: body.slice(0, start + lead),
    text: content.replaceAll('\r\n', '\n'),
    suffix: body.slice(end - trail),
    eol,
    breakBefore,
  }
}

/** Section `index` of the body opened for editing: its markdown under the heading line; null when there is none */
export function sectionSplice(body: string, index: number): BodySplice | null {
  const count = splitSections(body).sections.length
  if (index < 0 || index >= count) return null
  const heading = sectionOffset(body, index)
  const lineBreak = body.indexOf('\n', heading)
  const start = lineBreak === -1 ? body.length : lineBreak + 1
  const end = index + 1 < count ? sectionOffset(body, index + 1) : body.length
  return regionSplice(body, start, end, lineBreak === -1)
}

/** The lead — the markdown before the first `##` — opened for editing */
export function leadSplice(body: string): BodySplice {
  const end = splitSections(body).sections.length > 0 ? sectionOffset(body, 0) : body.length
  return regionSplice(body, 0, end, false)
}

/**
 * The body with the opened part's text replaced by what is typed. The typed
 * line breaks take the body's own; a line break is added only where the
 * typed text would otherwise run into the heading before or after it.
 */
export function spliceBody(splice: BodySplice, typed: string): string {
  const text = splice.eol === '\n' ? typed : typed.replace(/\r?\n/g, '\r\n')
  if (text === '') return `${splice.prefix}${splice.suffix}`
  const before = splice.breakBefore ? splice.eol : ''
  const runsInto = splice.suffix !== '' && !/^\s/.test(splice.suffix) && !text.endsWith('\n')
  return `${splice.prefix}${before}${text}${runsInto ? splice.eol : ''}${splice.suffix}`
}

/**
 * The section a selection names, read from the body as it is now: at its
 * index while the heading there is unchanged, else the one section with its
 * heading; null once it is gone. A repeated heading is never guessed: the
 * heading names a section only when it occurs once.
 */
export function sectionAt(
  body: string,
  heading: string,
  index: number,
): { section: BodySection; index: number } | null {
  const { sections } = splitSections(body)
  const atIndex = sections[index]
  if (atIndex?.heading === heading) return { section: atIndex, index }
  const matches = sections.flatMap((section, at) => (section.heading === heading ? [at] : []))
  const [only] = matches
  if (matches.length !== 1 || only === undefined) return null
  const section = sections[only]
  return section ? { section, index: only } : null
}

/** The body's lead: the markdown before its first `##` */
export function leadOf(body: string): string {
  return splitSections(body).lead
}

/**
 * How many words a piece of markdown holds: words by the language's own
 * boundaries, so Chinese and Japanese text is counted too. Without
 * `Intl.Segmenter`, runs of text with a letter or a digit.
 */
export function wordCount(markdown: string): number {
  if (typeof Intl.Segmenter === 'function') {
    const words = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(markdown)
    let count = 0
    for (const part of words) if (part.isWordLike) count++
    return count
  }
  return markdown.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

/**
 * The document field that holds a section's own meta description:
 * `meta-description-<section>`, the section named exactly as its heading is
 * written — the key the meta-description generator writes
 * (`generate-meta-descriptions.ts` in `@krantho/tools`). The llms.txt
 * enrichment reads the same key through the section name its site config
 * maps a route to, so that name is the heading as written.
 */
export function sectionMetaField(heading: string): string {
  return `meta-description-${heading}`
}

/** How a page template reads the section: `sections["<name>"]` */
export function sectionKey(heading: string): string {
  return `sections[${JSON.stringify(heading)}]`
}
