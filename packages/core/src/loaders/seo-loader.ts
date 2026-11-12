import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_SEO_GENERATED_DIR = join(process.cwd(), 'content/seo/generated')

/** Read an SEO file as a string, returning null if missing or unreadable. */
function readSeoFile(filename: string, basePath: string): string | null {
  try {
    return readFileSync(join(basePath, filename), 'utf-8')
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[SEO] ${filename} not found — run seo:generate to create it`)
    }
    return null
  }
}

export function loadSeoJson<T = Record<string, unknown>>(
  filename: string,
  basePath: string = DEFAULT_SEO_GENERATED_DIR,
): T | null {
  const raw = readSeoFile(filename, basePath)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn(`[SEO] ${filename} contains invalid JSON — skipping`)
    return null
  }
}

export function loadSeoText(
  filename: string,
  basePath: string = DEFAULT_SEO_GENERATED_DIR,
): string | null {
  return readSeoFile(filename, basePath)
}
