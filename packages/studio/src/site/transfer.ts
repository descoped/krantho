import type { RepositoryDocument } from '@krantho/core'
import { isRecord } from '../lib/guards.js'

export type ImportItem = RepositoryDocument

export type ParsedImport = { ok: true; items: ImportItem[] } | { ok: false; error: string }

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Preserve the complete portable envelope; the server validates the contract and values. */
function toImportItem(raw: unknown): ImportItem | null {
  if (
    !isRecord(raw) ||
    !isRecord(raw['identity']) ||
    !isRecord(raw['fields']) ||
    !isRecord(raw['metadata']) ||
    !Array.isArray(raw['defaults']) ||
    typeof raw['body'] !== 'string'
  )
    return null
  const identity = raw['identity']
  if (!text(identity['collection']) || !text(identity['slug']) || !text(identity['locale']))
    return null
  return raw as unknown as ImportItem
}

/** The items of an import file, or why it cannot be imported */
export function parseImport(source: string): ParsedImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { ok: false, error: 'This is not valid JSON.' }
  }
  const raw = isRecord(parsed) ? parsed['items'] : undefined
  if (!Array.isArray(raw)) return { ok: false, error: 'The JSON needs an "items" array.' }
  if (raw.length === 0) return { ok: false, error: 'The "items" array is empty.' }
  const items: ImportItem[] = []
  for (const [index, entry] of raw.entries()) {
    const item = toImportItem(entry)
    if (!item)
      return {
        ok: false,
        error: `Item ${index + 1} is missing its document identity or portable content envelope.`,
      }
    items.push(item)
  }
  return { ok: true, items }
}

/** The file an export downloads as: the collection and the locale it was read in */
export function exportFilename(collection: string, locale: string): string {
  return `${collection}-${locale}.json`
}
