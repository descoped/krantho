import type { DefaultProvenance } from '@krantho/core'
/** What the editor edits of a document: its fields and its markdown body */
export interface Draft {
  defaults?: readonly DefaultProvenance[] | undefined
  metadata: Record<string, Record<string, unknown>>
  fields: Record<string, unknown>
  body: string
}

/** JSON with object keys sorted, so two values compare by content, not key order */
export function stableJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, inner: unknown) => {
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return inner
      const entries = Object.entries(inner as Record<string, unknown>)
      return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
    }) ?? 'undefined'
  )
}

/** Whether two values are the same content; `undefined` equals absent */
function sameValue(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b)
}

/** Whether two drafts hold the same content; an absent field equals one set to `undefined` */
export function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.body === b.body &&
    sameValue(a.fields, b.fields) &&
    sameValue(a.metadata, b.metadata) &&
    sameValue(a.defaults ?? [], b.defaults ?? [])
  )
}

/**
 * The form's work once a save or publish answers with the saved copy: what
 * was sent becomes the saved copy, and whatever the person changed after it
 * was sent — a field or the body — stays as they typed it.
 */
export function rebaseDraft(current: Draft, sent: Draft, saved: Draft): Draft {
  const fields: Record<string, unknown> = {}
  const names = new Set([...Object.keys(saved.fields), ...Object.keys(current.fields)])
  for (const name of names) {
    const changedSince = !sameValue(current.fields[name], sent.fields[name])
    const value = changedSince ? current.fields[name] : saved.fields[name]
    if (value !== undefined) fields[name] = value
  }
  const body = current.body !== sent.body ? current.body : saved.body
  const metadata = rebaseValues(current.metadata, sent.metadata, saved.metadata)
  const defaults = !sameValue(current.defaults ?? [], sent.defaults ?? [])
    ? current.defaults
    : saved.defaults
  return { fields, body, metadata, ...(defaults?.length ? { defaults } : {}) }
}

/** Rebase individual group properties, keeping edits made during the request. */
function rebaseValues(
  current: Record<string, Record<string, unknown>>,
  sent: Record<string, Record<string, unknown>>,
  saved: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}
  for (const slot of new Set([...Object.keys(saved), ...Object.keys(current)])) {
    if (sameValue(current[slot], sent[slot])) {
      if (saved[slot] !== undefined) result[slot] = saved[slot]
      continue
    }
    if (!current[slot]) continue
    const values: Record<string, unknown> = {}
    for (const name of new Set([
      ...Object.keys(saved[slot] ?? {}),
      ...Object.keys(current[slot] ?? {}),
    ])) {
      const value = !sameValue(current[slot]?.[name], sent[slot]?.[name])
        ? current[slot]?.[name]
        : saved[slot]?.[name]
      if (value !== undefined) values[name] = value
    }
    result[slot] = values
  }
  return result
}

// ---------------------------------------------------------------------------
// New documents
// ---------------------------------------------------------------------------

/** The fields a new document's slug is suggested from, in order */
const TITLE_FIELDS = ['title', 'name'] as const

/** A slug from a title: lowercase words joined by hyphens */
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Whether a change to `name` suggests the new document's slug */
export function suggestsSlug(name: string): boolean {
  return (TITLE_FIELDS as readonly string[]).includes(name)
}
