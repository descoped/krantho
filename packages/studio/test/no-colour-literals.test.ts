import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Studio defines every colour once, in styles/tokens.css. The one exception is the
 * search-result preview (Data mode's SerpPreview), which imitates a search engine in that
 * engine's own colours — its literals live in one marked block in editor/data-mode/serp-preview.css.
 */

const SRC = join(import.meta.dirname, '../src')
const TOKENS = 'styles/tokens.css'
const SERP = 'editor/data-mode/serp-preview.css'
const SERP_START = '/* serp-preview-literals:start */'
const SERP_END = '/* serp-preview-literals:end */'

const LITERAL =
  /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/gi

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css') || path.endsWith('.tsx'))
    .map((path) => path.split('\\').join('/'))
    .sort()
}

function withoutSerpBlock(text: string): string {
  const start = text.indexOf(SERP_START)
  const end = text.indexOf(SERP_END)
  if (start === -1 || end < start) return text
  return text.slice(0, start) + text.slice(end + SERP_END.length)
}

function literalsIn(path: string): string[] {
  const text = readFileSync(join(SRC, path), 'utf8')
  const checked = path === SERP ? withoutSerpBlock(text) : text
  const found: string[] = []
  checked.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(LITERAL)) found.push(`${path}:${index + 1} ${match[0]}`)
  })
  return found
}

describe('colour literals', () => {
  it('recognises hex, rgb( and hsl( literals', () => {
    for (const sample of [
      '#fff',
      '#0a1120',
      '#0a112080',
      'rgb(0 0 0)',
      'rgba(0,0,0,.5)',
      'hsl(1 2% 3%)',
    ]) {
      expect(sample.match(LITERAL), sample).not.toBeNull()
    }
    for (const sample of ['#rrggbb', 'href="#add-field"', '&#123;', 'var(--color-text)']) {
      expect(sample.match(LITERAL), sample).toBeNull()
    }
  })

  it('appear in src only in styles/tokens.css and the marked search-result preview block', () => {
    const files = sourceFiles()
    expect(files).toContain(TOKENS)
    const found = files.filter((path) => path !== TOKENS).flatMap(literalsIn)
    expect(found).toEqual([])
  })

  it('has exactly one allow-listed block, in the search-result preview CSS', () => {
    const marked = sourceFiles().filter((path) =>
      readFileSync(join(SRC, path), 'utf8').includes(SERP_START),
    )
    expect(marked).toEqual([SERP])
    const text = readFileSync(join(SRC, SERP), 'utf8')
    expect(text.split(SERP_START)).toHaveLength(2)
    expect(text.split(SERP_END)).toHaveLength(2)
    expect(text.indexOf(SERP_END)).toBeGreaterThan(text.indexOf(SERP_START))
  })
})
