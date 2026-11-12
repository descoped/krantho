import type { TocEntry } from '../../lib/markdown'

// The on-page table of contents: the page's ## and ### headings, as rendered by
// lib/markdown.ts (the ids match the headings' anchors). Sticky in the right
// column on wide screens; left out on narrow ones, where the page reads top down.
// SectionHash marks the entry for the heading in view (aria-current).

// Heading text arrives HTML-escaped from the markdown renderer; React escapes again
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

function decode(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
}

export function DocsToc({ entries }: { entries: TocEntry[] }): React.ReactElement | null {
  if (entries.length < 2) return null
  return (
    <nav className="docs-toc" aria-labelledby="docs-toc-title" data-section-nav>
      <p className="docs-toc__title" id="docs-toc-title">
        On this page
      </p>
      <ol className="docs-toc__list">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.depth === 3 ? 'docs-toc__item docs-toc__item--sub' : 'docs-toc__item'}>
            <a href={`#${entry.id}`} className="docs-toc__link">
              {decode(entry.text)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
