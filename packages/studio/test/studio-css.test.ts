import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '../src')
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8')

/** Every stylesheet in src, joined */
function allCss(): string {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map(read)
    .join('\n')
}

/** The declarations of the first rule whose selector list is exactly `selector` */
function ruleBody(css: string, selector: string): string | null {
  const at = css.indexOf(`${selector} {`)
  if (at === -1) return null
  return css.slice(at, css.indexOf('}', at))
}

describe('Studio styles', () => {
  it('marks the selected editor mode with the accent bar, not a surface tint alone', () => {
    const rule = ruleBody(read('editor/editor.css'), '.editor-mode[aria-selected="true"]')
    expect(rule).toContain('inset 0 -2px 0 var(--color-accent)')
  })

  it('keeps no rules for classes the old editor used', () => {
    const css = allCss()
    expect(css).not.toMatch(/\.tag(?![\w-])/)
    expect(css).not.toMatch(/\.field-description(?![\w-])/)
  })

  it("keeps no rules for the old SEO screens' classes", () => {
    const css = allCss()
    for (const name of [
      'seo-dashboard',
      'seo-config-[\\w-]+',
      'archetype-[\\w-]+',
      'schema-detail-[\\w-]+',
      'seo-section',
      'btn-warning',
    ]) {
      expect(css).not.toMatch(new RegExp(`\\.${name}(?![\\w-])`))
    }
  })

  it('keeps every style in tokens.css, base.css or beside its component', () => {
    const styles = readdirSync(join(SRC, 'styles')).sort()
    expect(styles).toEqual(['base.css', 'tokens.css'])
  })

  it('keeps a focused control clear of a persistent error toast', () => {
    const rule = ruleBody(read('ui/toast.css'), 'html:has(.ui-toast--error)')
    expect(rule).toMatch(/scroll-padding-bottom:\s*\d+px/)
  })
})
