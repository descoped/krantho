// Local SEO helpers — reads from ../content/seo/.
// Duplicated across examples to avoid @krantho/core barrel import
// which triggers Node ESM resolution issues.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEO_GENERATED_DIR = join(process.cwd(), '..', 'content', 'seo', 'generated')

export function loadSeoJson<T = Record<string, unknown>>(filename: string): T | null {
  try {
    const raw = readFileSync(join(SEO_GENERATED_DIR, filename), 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
