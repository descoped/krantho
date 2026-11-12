// Local SEO helpers — reads from ../content/seo/.
// Duplicated across SvelteKit examples to avoid @krantho/core barrel import
// which triggers Node ESM resolution issues. Will consolidate when core
// supports subpath exports fully.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEO_DIR = join(process.cwd(), '..', 'content', 'seo')
const SEO_GENERATED_DIR = join(SEO_DIR, 'generated')

export function loadSeoJson<T = Record<string, unknown>>(filename: string): T | null {
  try {
    const raw = readFileSync(join(SEO_GENERATED_DIR, filename), 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadSeoText(filename: string): string | null {
  try {
    return readFileSync(join(SEO_GENERATED_DIR, filename), 'utf-8')
  } catch {
    return null
  }
}
