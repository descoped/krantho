import config from '../../krantho.config'
import { all, maybe, snippetCode, summaries, text, type Doc, type Summary } from '../../lib/content'
import { stackLabel } from '../../lib/markdown'
import { routeOf } from '../../lib/routes'
import { docsIndex, groupByArea, HOME_SLUG, readingOrder } from './docs-areas'

// llms.txt and llms-full.txt (https://llmstxt.org), written from the same
// published documents the pages render: the docs in reading order, grouped by
// area, then the product pages. Nothing here is hand-maintained.

const BASE_URL = (config.site?.baseUrl ?? 'https://krantho.com').replace(/\/$/, '')
const SITE_NAME = config.site?.name ?? 'Krantho'

export const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
}

function absolute(path: string): string {
  return `${BASE_URL}${path}`
}

function entry(doc: Summary): string {
  const description = text(doc, 'description')
  const link = `- [${text(doc, 'title')}](${absolute(routeOf(doc.collection, doc.slug, doc))})`
  return description ? `${link}: ${description}` : link
}

/** "# Krantho", the summary line and the project status, shared by both files */
async function header(docs: Summary[]): Promise<string> {
  const landing = await maybe('landing', 'home')
  const home = docs.find((doc) => doc.slug === HOME_SLUG)
  const summary = text(landing, 'description') || text(home, 'description')
  const status = docs.find((doc) => doc.slug === 'project-status')
  const lines = [`# ${SITE_NAME}`]
  if (summary) lines.push('', `> ${summary}`)
  if (status && text(status, 'description')) {
    lines.push('', `${text(status, 'description')} See [${text(status, 'title')}](${absolute(routeOf('docs', status.slug))}).`)
  }
  return lines.join('\n')
}

const PRODUCT: { collection: string }[] = [{ collection: 'features' }, { collection: 'stacks' }, { collection: 'hosts' }]

/** llms.txt: a linked index of the docs and the product pages */
export async function llmsIndex(): Promise<string> {
  const { docs } = await docsIndex()
  const home = docs.find((doc) => doc.slug === HOME_SLUG)
  const parts = [await header(docs)]
  if (home) parts.push(`## Docs\n\n${entry(home)}`)
  for (const { area, docs: pages } of groupByArea(docs)) {
    parts.push(`## Docs: ${area.label}\n\n${pages.map(entry).join('\n')}`)
  }
  const product = (await Promise.all(PRODUCT.map(({ collection }) => summaries(collection)))).flat()
  if (product.length > 0) parts.push(`## Product\n\n${product.map(entry).join('\n')}`)
  return `${parts.join('\n\n')}\n`
}

/** {{sample:name}} paragraphs expanded to the sample's code, one fence per stack */
function expandSamples(markdown: string, snippets: Doc[]): string {
  return markdown.replace(/^\{\{sample:([\w-]+)\}\}\s*$/gm, (_, name: string) =>
    snippets
      .filter((snippet) => text(snippet, 'sample') === name)
      .map((snippet) => {
        const stack = text(snippet, 'stack')
        const label = [text(snippet, 'filename'), stack && stack !== 'any' ? `(${stackLabel(stack)})` : '']
          .filter(Boolean)
          .join(' ')
        const fence = `\`\`\`${text(snippet, 'language') || 'ts'}\n${snippetCode(snippet)}\n\`\`\``
        return label ? `${label}:\n\n${fence}` : fence
      })
      .join('\n\n'),
  )
}

/**
 * Site-relative links made absolute, so the text stands on its own. Code —
 * fenced blocks and inline spans — is left as written: its links are examples.
 */
function absoluteLinks(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\]\(\//g, `](${BASE_URL}/`)))
    .join('')
}

function fullPage(doc: Doc, snippets: Doc[]): string {
  const lines = [`# ${text(doc, 'title')}`, '', `Source: ${absolute(routeOf('docs', doc.slug))}`]
  const description = text(doc, 'description')
  if (description) lines.push('', `> ${description}`)
  const body = absoluteLinks(expandSamples(doc.rawContent.trim(), snippets))
  if (body) lines.push('', body)
  return lines.join('\n')
}

/** llms-full.txt: every docs page's title and full markdown body, in reading order */
export async function llmsFull(): Promise<string> {
  const [docs, snippets] = await Promise.all([all('docs'), all('snippets')])
  const pages = readingOrder(docs).map((doc) => fullPage(doc, snippets))
  return `${[await header(docs), ...pages].join('\n\n---\n\n')}\n`
}
