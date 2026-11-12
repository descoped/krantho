import { Marked, type Token, type Tokens } from 'marked'
import { highlight } from './highlight'
import { sample, snippetCode, text, type Doc } from './content'
import { diagramHtml } from './diagrams'

// Markdown for krantho.com pages and docs, rendered on the server:
//   - headings get ids and anchors; h2/h3 form the table of contents
//   - fences take `title="file.ts"` and `stack="next|sveltekit|express"`; adjacent
//     stack fences become one tabbed group that follows the visitor's stack
//   - a paragraph `{{sample:name}}` embeds the snippets sharing that sample
//   - a paragraph `{{screen:name|/studio/path|alt text}}` embeds a screenshot of
//     Studio, `/screens/<name>-light.webp` and `-dark.webp`, in a browser frame
//   - a paragraph `{{diagram:name}}` embeds an inline SVG diagram (lib/diagrams.ts)
//   - `> [!NOTE]`, `[!TIP]`, `[!CAUTION]`, `[!SINCE] 0.2.0` become callouts
//   - tables scroll horizontally on small screens

export interface TocEntry {
  id: string
  text: string
  depth: 2 | 3
}

export interface Rendered {
  html: string
  toc: TocEntry[]
}

const STACK_LABELS: Record<string, string> = {
  next: 'Next.js',
  sveltekit: 'SvelteKit',
  express: 'Express / Vite',
  any: 'Any stack',
}

export function stackLabel(stack: string): string {
  return STACK_LABELS[stack] ?? stack
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, '')
    .replace(/[`'"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface FenceMeta {
  lang: string
  title?: string | undefined
  stack?: string | undefined
}

function parseFence(info: string): FenceMeta {
  const [lang = '', ...rest] = info.trim().split(/\s+/)
  const meta = rest.join(' ')
  const attr = (name: string): string | undefined =>
    meta.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? meta.match(new RegExp(`${name}=(\\S+)`))?.[1]
  return { lang, title: attr('title'), stack: attr('stack') }
}

export interface CodeVariant {
  code: string
  lang: string
  file?: string | undefined
  stack?: string | undefined
}

const COPY_ICON =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'

function copyButton(): string {
  return `<button type="button" class="copy-button" data-copy>${COPY_ICON}<span>Copy</span></button>`
}

/** One code block, or a stack-tabbed group when variants name their stacks */
export async function codeBlockHtml(variants: CodeVariant[]): Promise<string> {
  const panels = await Promise.all(variants.map((variant) => highlight(variant.code, variant.lang)))
  const stacked = variants.length > 1 && variants.every((variant) => variant.stack)
  if (!stacked) {
    const [first] = variants
    const file = first?.file ? `<span class="code-block__file">${escapeHtml(first.file)}</span>` : '<span class="code-block__file"></span>'
    const bar = first?.file || (first?.lang && first.lang !== 'text') ? `<div class="code-block__bar">${file || `<span>${escapeHtml(first?.lang ?? '')}</span>`}${copyButton()}</div>` : ''
    const plainCopy = bar ? '' : `<div class="code-block__bar"><span class="code-block__file">${escapeHtml(first?.lang ?? '')}</span>${copyButton()}</div>`
    return `<div class="code-block">${bar || plainCopy}${panels.join('')}</div>`
  }
  const tabs = variants
    .map(
      (variant) =>
        `<button type="button" class="stack-tab" data-stack-tab="${escapeHtml(variant.stack ?? '')}">${escapeHtml(stackLabel(variant.stack ?? ''))}</button>`,
    )
    .join('')
  const body = variants
    .map(
      (variant, index) =>
        `<div data-stack-variant="${escapeHtml(variant.stack ?? '')}">${
          variant.file ? `<div class="code-block__subfile">${escapeHtml(variant.file)}</div>` : ''
        }${panels[index] ?? ''}</div>`,
    )
    .join('')
  return `<div class="code-block stack-group"><div class="code-block__bar"><div class="stack-group__tabs" role="group" aria-label="Choose your stack">${tabs}</div>${copyButton()}</div><div class="stack-group__panels">${body}</div></div>`
}

/** `{{screen:name|/studio/path|alt}}`: a screenshot's name, the address it shows and its alt text */
const SCREEN = /^\{\{screen:([\w-]+)\|([^|{}]+)\|([^{}]+)\}\}$/

/** A screenshot of Studio in a browser frame, one image per theme (`app/styles/shot.css`) */
export function screenHtml(name: string, path: string, alt: string): string {
  // Each image opens at full size: in a page's text column it shows smaller than it was taken
  const image = (theme: 'light' | 'dark'): string => {
    const src = `/screens/${name}-${theme}.webp`
    return `<a class="shot__img shot__img--${theme}" href="${src}"><img src="${src}" width="1600" height="1000" loading="lazy" decoding="async" alt="${escapeHtml(alt.trim())}"></a>`
  }
  const bar = `<div class="shot__bar" aria-hidden="true"><span class="shot__dots"><span></span><span></span><span></span></span><span class="shot__url">${escapeHtml(path.trim())}</span></div>`
  return `<figure class="shot">${bar}${image('light')}${image('dark')}</figure>\n`
}

/** A sample's snippets as one code block (tabbed when they cover several stacks) */
export async function sampleHtml(name: string): Promise<string> {
  const snippets = await sample(name)
  if (snippets.length === 0) return ''
  return codeBlockHtml(snippets.map(snippetVariant))
}

export function snippetVariant(doc: Doc): CodeVariant {
  const stack = text(doc, 'stack')
  return {
    code: snippetCode(doc),
    lang: text(doc, 'language') || 'ts',
    file: text(doc, 'filename') || undefined,
    stack: stack && stack !== 'any' ? stack : undefined,
  }
}

const CALLOUT = /^\s*\[!(NOTE|TIP|CAUTION|WARNING|SINCE)\]\s*([^\n]*)\n?/i

/** Block-level children of a container token (blockquote, list items) */
function childTokenLists(token: Token): Token[][] {
  if (token.type === 'blockquote') return [(token as Tokens.Blockquote).tokens]
  if (token.type === 'list') return (token as Tokens.List).items.map((item) => item.tokens)
  return []
}

/** Group adjacent stack-tagged fences, and pre-render every code and sample block */
async function prepare(tokens: Token[]): Promise<Map<Token, string>> {
  const html = new Map<Token, string>()
  const jobs: Promise<void>[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'code') {
      const group: Tokens.Code[] = [token as Tokens.Code]
      const meta = parseFence((token as Tokens.Code).lang ?? '')
      if (meta.stack) {
        let j = i + 1
        while (j < tokens.length) {
          const next = tokens[j]
          if (next?.type === 'space') {
            j++
            continue
          }
          if (next?.type === 'code' && parseFence((next as Tokens.Code).lang ?? '').stack) {
            group.push(next as Tokens.Code)
            html.set(next, '')
            j++
            continue
          }
          break
        }
      }
      const variants = group.map((code) => {
        const fence = parseFence(code.lang ?? '')
        return { code: code.text, lang: fence.lang, file: fence.title, stack: fence.stack }
      })
      jobs.push(codeBlockHtml(variants).then((rendered) => void html.set(token, rendered)))
      continue
    }
    if (token.type === 'paragraph') {
      const paragraph = (token as Tokens.Paragraph).text.trim()
      const match = paragraph.match(/^\{\{sample:([\w-]+)\}\}$/)
      if (match?.[1]) {
        const name = match[1]
        jobs.push(sampleHtml(name).then((rendered) => void html.set(token, rendered)))
      }
      const screen = paragraph.match(SCREEN)
      if (screen?.[1] && screen[2] && screen[3]) html.set(token, screenHtml(screen[1], screen[2], screen[3]))
      const diagram = paragraph.match(/^\{\{diagram:([\w-]+)\}\}$/)
      if (diagram?.[1]) html.set(token, diagramHtml(diagram[1]))
    }
    for (const nested of childTokenLists(token)) {
      jobs.push(prepare(nested).then((inner) => inner.forEach((value, key) => html.set(key, value))))
    }
  }
  await Promise.all(jobs)
  return html
}

/** Render markdown to HTML with a table of contents */
export async function renderMarkdown(source: string): Promise<Rendered> {
  const toc: TocEntry[] = []
  const used = new Map<string, number>()
  const marked = new Marked({ gfm: true })
  const tokens = marked.lexer(source)
  const prepared = await prepare(tokens)

  marked.use({
    renderer: {
      heading({ tokens: inline, depth }) {
        const content = this.parser.parseInline(inline)
        const plain = content.replace(/<[^>]*>/g, '')
        const base = slugify(plain) || 'section'
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const id = count ? `${base}-${count}` : base
        if (depth === 2 || depth === 3) toc.push({ id, text: plain, depth })
        const anchor = depth > 1 ? `<a class="heading-anchor" href="#${id}" aria-label="Link to ${plain}">#</a>` : ''
        return `<h${depth} id="${id}">${content}${anchor}</h${depth}>\n`
      },
      code(token) {
        const rendered = prepared.get(token)
        if (rendered !== undefined) return rendered
        return `<div class="code-block"><pre><code>${escapeHtml(token.text)}</code></pre></div>`
      },
      paragraph(token) {
        const rendered = prepared.get(token)
        if (rendered !== undefined) return rendered
        return `<p>${this.parser.parseInline(token.tokens)}</p>\n`
      },
      table(token) {
        const header = token.header
          .map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
          .join('')
        const rows = token.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`)
          .join('')
        return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`
      },
      blockquote(token) {
        const body = this.parser.parse(token.tokens)
        const raw = token.text
        const callout = raw.match(CALLOUT)
        if (!callout) return `<blockquote>${body}</blockquote>\n`
        const kind = (callout[1] ?? 'NOTE').toUpperCase()
        const variant = kind === 'CAUTION' || kind === 'WARNING' ? 'caution' : kind === 'SINCE' ? 'since' : 'note'
        const label = kind === 'SINCE' ? `Since ${callout[2] ?? ''}`.trim() : kind === 'TIP' ? 'Tip' : kind === 'NOTE' ? 'Note' : 'Caution'
        const inner = body.replace(/\[!(NOTE|TIP|CAUTION|WARNING|SINCE)\][^<\n]*(<br>)?\s*/i, '').replace(/<p>\s*<\/p>/g, '')
        return `<aside class="callout callout--${variant}"><div class="callout__title">${escapeHtml(label)}</div>${inner}</aside>\n`
      },
      link({ href, title, tokens: inline }) {
        const content = this.parser.parseInline(inline)
        const external = /^https?:\/\//.test(href) && !href.startsWith('https://krantho.com')
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        const rel = external ? ' rel="noopener" target="_blank"' : ''
        return `<a href="${escapeHtml(href)}"${titleAttr}${rel}>${content}</a>`
      },
    },
  })

  const html = marked.parser(tokens)
  return { html, toc }
}
