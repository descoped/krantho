import { splitSections } from '@krantho/core/sections'
import { type FoundMark, generatesNoBox, type MarkTarget, markKey } from './live-marks.js'
import { type DesignedSection, pageSections } from './side-panel/page-sections.js'

/**
 * Which body section a mark is. A heading the body has once: every mark with
 * that heading is that section — the body's render and any section rendered
 * on its own alike. A heading the body has more than once: only the body's own
 * render tells them apart, its nth mark with that heading being the nth
 * section; a mark outside it is ambiguous and never edited in place.
 */
export type SectionPlace =
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'missing' }

/** The body's sections with a heading: as written, else as core compares headings */
function sectionsHeaded(body: string, heading: string): number[] {
  const { sections } = splitSections(body)
  const indexes = (match: (written: string) => boolean): number[] =>
    sections.flatMap((section, index) => (match(section.heading) ? [index] : []))
  const exact = indexes((written) => written === heading)
  if (exact.length > 0) return exact
  const wanted = heading.trim().toLowerCase()
  return indexes((written) => written.toLowerCase() === wanted)
}

/** The section a `markBodySections` wrapper marks: its heading, the lead as null; undefined for any other element */
function wrapperHeading(
  element: Element | null,
  wrappers: ReadonlyMap<Element, MarkTarget>,
): string | null | undefined {
  const target = element ? wrappers.get(element) : undefined
  if (!target || target.kind === 'field') return undefined
  return target.kind === 'lead' ? null : target.heading
}

/**
 * The run starting at `first` when it is the body's render: consecutive
 * sibling wrappers — the lead's, if any, then one per section with the
 * body's headings in the body's order. Null when it is not.
 */
function runFrom(
  first: Element,
  headings: readonly string[],
  wrappers: ReadonlyMap<Element, MarkTarget>,
): Element[] | null {
  let at: Element | null = first
  if (wrapperHeading(at, wrappers) === null) at = at.nextElementSibling
  const run: Element[] = []
  for (const heading of headings) {
    if (!at || wrapperHeading(at, wrappers) !== heading) return null
    run.push(at)
    at = at.nextElementSibling
  }
  return run
}

/** Each element of the run with its place among the run's sections with the same heading */
function occurrencesOf(run: readonly Element[], headings: readonly string[]): Map<Element, number> {
  const seen = new Map<string, number>()
  return new Map(
    run.map((element, index) => {
      const heading = headings[index] ?? ''
      const occurrence = seen.get(heading) ?? 0
      seen.set(heading, occurrence + 1)
      return [element, occurrence] as const
    }),
  )
}

/**
 * The marks with the sections of the body's own render numbered per heading.
 * The render is the run of `markBodySections` wrappers (`display: contents`)
 * of the document side by side whose headings are the body's, in the body's
 * order; a section the site renders on its own — beside the run or anywhere
 * else, `display: contents` or not — is not numbered. A page whose render no
 * longer matches the body numbers none, so a repeated heading is never
 * guessed at.
 */
export function numberBodySections(marks: readonly FoundMark[], body: string): FoundMark[] {
  const headings = splitSections(body).sections.map((section) => section.heading)
  const wrappers = new Map<Element, MarkTarget>()
  for (const { element, target } of marks) {
    if (target.kind !== 'field' && generatesNoBox(element)) wrappers.set(element, target)
  }
  const starts = headings.length === 0 ? [] : [...wrappers.keys()]
  const runs = starts
    .map((first) => runFrom(first, headings, wrappers))
    .filter((r): r is Element[] => r !== null)
  const firsts = new Set(runs.map((r) => r[0]))
  // One run or none: two places the body's headings line up is a guess
  const [run] = runs
  if (!run || firsts.size !== 1) return [...marks]
  const occurrences = occurrencesOf(run, headings)
  return marks.map((mark) => {
    const occurrence = occurrences.get(mark.element)
    if (occurrence === undefined || mark.target.kind !== 'section') return mark
    return { element: mark.element, target: { ...mark.target, occurrence } }
  })
}

/** The body section a section mark is, by the rule above */
export function placeOfSection(
  body: string,
  heading: string,
  occurrence: number | null,
): SectionPlace {
  const matched = sectionsHeaded(body, heading)
  const [only] = matched
  if (only === undefined) return { kind: 'missing' }
  if (matched.length === 1) return { kind: 'index', index: only }
  if (occurrence === null) return { kind: 'ambiguous' }
  const index = matched[occurrence]
  return index === undefined ? { kind: 'missing' } : { kind: 'index', index }
}

/** The body section a mark's target is; null for a field, the lead or a section it cannot tell */
export function sectionIndexOf(body: string, target: MarkTarget): number | null {
  if (target.kind !== 'section') return null
  const place = placeOfSection(body, target.heading, target.occurrence)
  return place.kind === 'index' ? place.index : null
}

/**
 * The marked elements that render this field, section or lead — for a
 * section every mark that is the same body section, so typing patches each
 * place the page shows it; a section it cannot tell is only its own marks
 */
export function elementsOf(
  marks: readonly FoundMark[],
  target: MarkTarget,
  body: string,
): Element[] {
  const index = sectionIndexOf(body, target)
  const key = markKey(target)
  const same = (mark: FoundMark): boolean =>
    index === null ? markKey(mark.target) === key : sectionIndexOf(body, mark.target) === index
  return marks.filter(same).map((mark) => mark.element)
}

/** The mark that renders the body's section `index` — the body's own render first — if the page marks it */
export function markOfSection(
  marks: readonly FoundMark[],
  body: string,
  index: number,
): FoundMark | null {
  const marking = marks.filter((mark) => sectionIndexOf(body, mark.target) === index)
  const inBody = marking.find(
    ({ target }) => target.kind === 'section' && target.occurrence !== null,
  )
  return inBody ?? marking[0] ?? null
}

/** Where a designed section the body lacks would show in the page: after or before a marked neighbour */
export interface PlaceholderAnchor {
  readonly name: string
  /** The neighbouring designed section's mark; null when no neighbour is marked on the page */
  readonly mark: FoundMark | null
  readonly side: 'after' | 'before'
  /** The neighbour's heading, which names the position: "after Problem" */
  readonly neighbour: string | null
}

/**
 * Each designed section the body lacks, anchored where the page would show
 * it: after the nearest earlier designed section the page marks, else before
 * the nearest later one, else nowhere in the page (null)
 */
export function placeholderAnchors(
  body: string,
  designed: readonly string[],
  marks: readonly FoundMark[],
): PlaceholderAnchor[] {
  const rows = pageSections(body, designed).designed
  const marked = (row: DesignedSection): { mark: FoundMark; heading: string } | null => {
    const mark = row.found ? markOfSection(marks, body, row.found.index) : null
    return mark && row.found ? { mark, heading: row.found.heading } : null
  }
  const first = (from: readonly DesignedSection[]) =>
    from.map(marked).find((found) => found !== null) ?? null
  return rows.flatMap((row, at): PlaceholderAnchor[] => {
    if (row.found) return []
    const earlier = first(rows.slice(0, at).reverse())
    if (earlier) return [{ name: row.name, side: 'after', ...anchor(earlier) }]
    const later = first(rows.slice(at + 1))
    if (later) return [{ name: row.name, side: 'before', ...anchor(later) }]
    return [{ name: row.name, side: 'after', mark: null, neighbour: null }]
  })
}

function anchor(found: { mark: FoundMark; heading: string }): {
  mark: FoundMark
  neighbour: string
} {
  return { mark: found.mark, neighbour: found.heading }
}
