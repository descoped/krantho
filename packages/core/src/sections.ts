/**
 * A document body's sections: the markdown before the first `##` heading (the
 * lead) and each `##` heading with the markdown under it, in order. The one
 * definition the server, the UI packages, Studio and page templates share.
 * Pure — no imports — so a browser bundle can use it on its own
 * (`@krantho/core/sections`).
 */

/** One `##` section of a body */
export interface BodySection {
  /** The heading text as written, without the `##`, trailing `#`s or surrounding spaces */
  readonly heading: string
  /** The markdown under the heading, up to the next `##`, trimmed */
  readonly markdown: string
}

/** A body split at its `##` headings */
export interface SplitBody {
  /** The markdown before the first `##` heading, trimmed */
  readonly lead: string
  readonly sections: readonly BodySection[]
}

/** The name a page uses for the lead when it marks sections */
export const LEAD_SECTION = '__lead'

const HEADING = /^##\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(`{3,}|~{3,})/

/** The fence a line opens or closes, if it is one */
function fenceOf(line: string): string | undefined {
  return FENCE.exec(line)?.[1]
}

/**
 * Split a body at its `##` headings. A heading inside a fenced code block is
 * text, not a heading; a fence closes with the marker that opened it (at
 * least as long). Sections that share a heading stay separate.
 */
export function splitSections(body: string): SplitBody {
  const lead: string[] = []
  const sections: Array<{ heading: string; lines: string[] }> = []
  let fence: string | undefined
  for (const line of body.split('\n')) {
    const marker = fenceOf(line)
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence ? undefined : marker
    }
    const heading = fence || marker ? null : HEADING.exec(line)
    if (heading?.[1]) {
      sections.push({ heading: heading[1], lines: [] })
      continue
    }
    const current = sections.at(-1)
    if (current) current.lines.push(line)
    else lead.push(line)
  }
  return {
    lead: lead.join('\n').trim(),
    sections: sections.map((s) => ({ heading: s.heading, markdown: s.lines.join('\n').trim() })),
  }
}

/**
 * Put a split body back together: the lead, then each section as
 * `## heading` and its markdown, parts separated by one blank line. Joining a
 * split body gives the body back with its parts trimmed.
 */
export function joinSections(split: SplitBody): string {
  const parts = [
    split.lead,
    ...split.sections.map((s) =>
      s.markdown ? `## ${s.heading}\n\n${s.markdown}` : `## ${s.heading}`,
    ),
  ]
  return parts.filter((part) => part !== '').join('\n\n')
}

/** The split body with one section's markdown replaced; nothing else changes */
export function replaceSection(split: SplitBody, index: number, markdown: string): SplitBody {
  if (index < 0 || index >= split.sections.length) {
    throw new RangeError(`No section at index ${index}`)
  }
  return {
    lead: split.lead,
    sections: split.sections.map((section, i) =>
      i === index ? { heading: section.heading, markdown: markdown.trim() } : section,
    ),
  }
}

/** The first section with this heading, compared without case; undefined when there is none */
export function findSection(
  from: SplitBody | readonly BodySection[],
  heading: string,
): BodySection | undefined {
  const sections = 'sections' in from ? from.sections : from
  const wanted = heading.trim().toLowerCase()
  return sections.find((section) => section.heading.toLowerCase() === wanted)
}
