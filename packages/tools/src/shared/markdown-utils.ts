/**
 * Shared markdown utilities for tools that process CMS content.
 *
 * Used by:
 *   - tools/seo/enrich-faq.ts
 *   - tools/cms/generate-meta-descriptions.ts
 */

/**
 * Build the predicate that decides which frontmatter fields stay out of the text sent to the
 * model. Patterns come from `tools.enrich.skipFields`; a trailing `*` matches a prefix.
 */
export function createFieldFilter(patterns: readonly string[]): (key: string) => boolean {
  const exact = new Set(patterns.filter((p) => !p.endsWith('*')))
  const prefixes = patterns.filter((p) => p.endsWith('*')).map((p) => p.slice(0, -1))
  return (key) => exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix))
}

/** Clean markdown to plain text — strips headings, bold, links, and list markers */
export function cleanMarkdown(text: string): string {
  return text
    .replace(/^##\s+.+$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^- /gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
}
