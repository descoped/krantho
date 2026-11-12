import { createHighlighter, type Highlighter } from 'shiki'

// One highlighter per server process. Both themes are emitted as CSS variables
// (--shiki-light / --shiki-dark); app/styles/base.css picks one per theme.

const LANGS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'bash',
  'svelte',
  'yaml',
  'markdown',
  'html',
  'css',
  'sql',
  'go',
  'diff',
] as const

const ALIASES: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  md: 'markdown',
}

// Vitesse colors that fall below 4.5:1 on the site's code background, darkened
// (light) or lightened (dark) by the smallest step that clears WCAG AA
const CONTRAST: Record<string, Record<string, string>> = {
  'vitesse-light': {
    '#999999': '#707070',
    '#b07d48': '#92683c',
    '#b5695977': '#a35e4b',
    '#b56959': '#a85b4b',
    '#59873a': '#517b35',
    '#ab5959': '#ab5858',
    '#a0ada0': '#657465',
    '#998418': '#816f14',
    '#2e8f82': '#287d71',
  },
  'vitesse-dark': {
    '#666666': '#7f7f7f',
    '#c98a7d77': '#99777c',
    '#758575dd': '#738477',
  },
}

let highlighter: Promise<Highlighter> | undefined

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: ['vitesse-light', 'vitesse-dark'],
    langs: [...LANGS],
  })
  return highlighter
}

/** The language Shiki knows for a fence's info string, or plain text */
function resolveLang(lang: string | undefined): string {
  const name = (lang ?? '').toLowerCase()
  const resolved = ALIASES[name] ?? name
  return (LANGS as readonly string[]).includes(resolved) ? resolved : 'text'
}

const TOKEN_STYLE = /<span style="--shiki-light:(#[0-9a-fA-F]+);--shiki-dark:(#[0-9a-fA-F]+)"/g

/**
 * Every token span carries its two colors inline, and a sample repeats a handful
 * of pairs hundreds of times — in the HTML and again in the page's React
 * payload. Each pair becomes one short class, defined once beside the code.
 */
function compact(html: string): string {
  const rules = new Map<string, string>()
  const body = html.replace(TOKEN_STYLE, (_, light: string, dark: string) => {
    const name = `k${light.slice(1)}${dark.slice(1)}`.toLowerCase()
    rules.set(name, `.${name}{--shiki-light:${light};--shiki-dark:${dark}}`)
    return `<span class="${name}"`
  })
  return rules.size ? `<style>${[...rules.values()].join('')}</style>${body}` : body
}

/** Highlighted `<pre class="shiki">` for a code sample, in both themes */
export async function highlight(code: string, lang?: string): Promise<string> {
  const shiki = await getHighlighter()
  const html = shiki.codeToHtml(code.replace(/\n$/, ''), {
    lang: resolveLang(lang),
    themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
    defaultColor: false,
    colorReplacements: CONTRAST,
  })
  return compact(html)
}
