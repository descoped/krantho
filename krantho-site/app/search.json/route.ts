import { all, text, type Doc } from '../../lib/content'
import { routeOf } from '../../lib/routes'

// The search index the command palette loads: every published page and docs
// page, with its headings and plain text. Content reads are cached by the
// krantho loader until a change in /studio.

const SEARCHABLE: { collection: string; section: string }[] = [
  { collection: 'docs', section: 'Docs' },
  { collection: 'features', section: 'Features' },
  { collection: 'stacks', section: 'Stacks' },
  { collection: 'hosts', section: 'Deploy' },
  { collection: 'releases', section: 'Changelog' },
  { collection: 'pages', section: 'Pages' },
  { collection: 'faq', section: 'FAQ' },
  { collection: 'glossary', section: 'Glossary' },
]

function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\{\{sample:[\w-]+\}\}/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>\s*\[![A-Z]+\][^\n]*/gm, ' ')
    .replace(/[#>*_|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
}

function headings(markdown: string): string {
  const outsideFences = markdown.replace(/```[\s\S]*?```/g, ' ')
  return Array.from(outsideFences.matchAll(/^#{2,3}\s+(.+)$/gm), (match) => match[1] ?? '').join(' · ')
}

function entry(doc: Doc, section: string) {
  return {
    id: `${doc.collection}/${doc.slug}`,
    title: text(doc, 'title'),
    description: text(doc, 'description') || text(doc, 'definition'),
    url: routeOf(doc.collection, doc.slug, doc),
    section,
    headings: headings(doc.rawContent),
    text: plain(doc.rawContent),
  }
}

export async function GET(): Promise<Response> {
  const groups = await Promise.all(
    SEARCHABLE.map(async ({ collection, section }) => (await all(collection)).map((doc) => entry(doc, section))),
  )
  return Response.json(groups.flat(), {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  })
}
