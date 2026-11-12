import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/**
 * Content reaches the adapter through these modules alone: each validates
 * against the active contract or keeps the document's own, names the version
 * it read, and announces the change. A new writer belongs in one of them.
 */
const WRITERS = [
  'api/src/save-document.ts',
  'api/src/document-actions.ts',
  'api/src/media-reference-updater.ts',
]

describe('content write paths', () => {
  it('writes content only through the controlled write modules', () => {
    const writers = ['api/src', 'server/src']
      .flatMap((dir) => sources(join(root, dir)))
      .filter((file) => /\.writeContent\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file))
    expect(writers.sort()).toEqual([...WRITERS].sort())
  })
})
