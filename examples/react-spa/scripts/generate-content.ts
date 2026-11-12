/**
 * Build-time content generator — pre-parses markdown into JSON.
 * The SPA loads JSON at runtime (no markdown processing in browser).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import matter from 'gray-matter'
import { marked } from 'marked'

// Process pages, globals (navigation/footer/contact-info), and services —
// the SPA's useContent reads all of them by slug. Generating only pages left
// the logo, nav, footer, and service cards empty.
const CONTENT_ROOT = join(process.cwd(), '..', 'content')
const SOURCE_DIRS = ['pages', 'globals', 'services'].map((d) => join(CONTENT_ROOT, d))
const OUTPUT_DIR = join(process.cwd(), 'public', 'content', 'json')

mkdirSync(OUTPUT_DIR, { recursive: true })

function extractSections(html: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = html.split(/<h2[^>]*>/)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const titleEnd = part.indexOf('</h2>')
    if (titleEnd === -1) continue
    // Key sections by the raw heading text ("Our Team"), matching the core
    // ContentEngine's extractSections — so section lookups are identical to the
    // other examples and the nextjs-shadcn reference.
    const title = part.substring(0, titleEnd).replace(/<[^>]*>/g, '').trim()
    const content = part.substring(titleEnd + 5).trim()
    if (title && content) sections[title] = content
  }
  return sections
}

let count = 0
for (const dir of SOURCE_DIRS) {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    continue
  }
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8')
      const { data: frontmatter, content } = matter(raw)
      const html = marked.parse(content) as string
      const sections = extractSections(html)
      const slug = basename(file, '.md')

      const json = { fields: frontmatter, content, html, sections }
      writeFileSync(join(OUTPUT_DIR, `${slug}.json`), JSON.stringify(json))
      console.log(`[Content] ${slug}.json`)
      count++
    } catch (err) {
      console.error(`[Content] Failed to process ${file}:`, err)
    }
  }
}

console.log(`[Content] ${count} files generated in public/content/json/`)
