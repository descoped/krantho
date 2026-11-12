import { canonicalJson } from '@krantho/core'
import type { DocumentChange, DocumentRef, FieldChange } from './protocol.js'

/** A document's fields and body */
export interface DocumentState {
  fields: Record<string, unknown>
  body: string
}

/**
 * Every field whose value differs, and the body when it differs. The `status`
 * field mirrors the row status a save sets; a status change is the change's
 * `status`, which the caller fills from the row statuses.
 */
export function diffDocument(
  ref: DocumentRef,
  baseVersion: number,
  before: DocumentState | null,
  after: DocumentState,
): DocumentChange {
  const beforeFields = before?.fields ?? {}
  const names = [...new Set([...Object.keys(beforeFields), ...Object.keys(after.fields)])]
  const fields: FieldChange[] = names
    .filter((name) => name !== 'status')
    .filter((name) => canonicalJson(beforeFields[name]) !== canonicalJson(after.fields[name]))
    .map((name) => ({ name, before: beforeFields[name], after: after.fields[name] }))

  const beforeBody = before?.body ?? ''
  const change: DocumentChange = { ref, baseVersion, fields }
  if (beforeBody !== after.body) change.body = { before: beforeBody, after: after.body }
  return change
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** True when the change replaces or removes a non-empty value */
export function isOverwrite(change: DocumentChange): boolean {
  if (change.fields.some((field) => !isEmptyValue(field.before))) return true
  return change.body !== undefined && change.body.before.trim() !== ''
}

const FENCE = /^\s*(```|~~~)/
const SECTION_HEADING = /^##\s+(.*?)\s*#*\s*$/

/** The heading text of each `## ` line outside code fences, with its line index */
function sectionLines(lines: readonly string[]): Array<{ index: number; heading: string }> {
  const found: Array<{ index: number; heading: string }> = []
  let inFence = false
  lines.forEach((line, index) => {
    if (FENCE.test(line)) inFence = !inFence
    if (inFence) return
    const match = SECTION_HEADING.exec(line)
    if (match) found.push({ index, heading: (match[1] ?? '').trim() })
  })
  return found
}

/** The `## ` headings of a body, in order */
export function listSections(body: string): string[] {
  return sectionLines(body.split('\n')).map((section) => section.heading)
}

/** Replace the content of one section, returning the new lines */
function replaceSection(lines: string[], heading: string, content: string): string[] {
  const sections = sectionLines(lines)
  const wanted = heading.trim().toLowerCase()
  const position = sections.findIndex((section) => section.heading.toLowerCase() === wanted)
  const section = sections[position]
  if (!section) throw new Error(`No section "${heading}" in the body`)

  const end = sections[position + 1]?.index ?? lines.length
  const replacement = ['', ...content.trim().split('\n')]
  if (end < lines.length) replacement.push('')
  return [...lines.slice(0, section.index + 1), ...replacement, ...lines.slice(end)]
}

/** Replace the content under each `## heading`; throws naming a heading that is not found */
export function replaceSections(
  body: string,
  edits: ReadonlyArray<{ heading: string; content: string }>,
): string {
  let lines = body.split('\n')
  for (const edit of edits) lines = replaceSection(lines, edit.heading, edit.content)
  return lines.join('\n')
}
