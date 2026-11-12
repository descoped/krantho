import { getAllCMSContent, getAllCMSSummaries, getCMSContent } from '@krantho/ui-react/server'
import type { CMSContent, CMSSummary } from '@krantho/ui-react/server'
import { requirePublished } from './krantho'

// Typed reads over the site's content templates (krantho.collections.ts). Every
// read goes through the krantho loader: published versions only, cached until a
// change in /studio invalidates the page that read it.

/** A document with its body */
export type Doc = CMSContent

/** A document without its body: what a list, a card or a navigation shows */
export type Summary = CMSSummary

/** A string field, or '' when unset */
export function text(doc: Summary | undefined, name: string): string {
  const value = doc?.fields[name]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** A string-array field, or [] when unset */
export function list(doc: Summary | undefined, name: string): string[] {
  const value = doc?.fields[name]
  return Array.isArray(value) ? value.map(String) : []
}

/** A number field, or the fallback */
export function num(doc: Summary | undefined, name: string, fallback = 99): number {
  const value = Number(doc?.fields[name])
  return Number.isFinite(value) ? value : fallback
}

/** A published document; 404 when it has no published version */
export function page(collection: string, slug: string): Promise<Doc> {
  return requirePublished(collection, slug)
}

/** A published document, or undefined */
export async function maybe(collection: string, slug: string): Promise<Doc | undefined> {
  try {
    return await getCMSContent(collection, slug)
  } catch {
    return undefined
  }
}

const byOrderThenTitle = (a: Summary, b: Summary): number =>
  num(a, 'order') - num(b, 'order') || text(a, 'title').localeCompare(text(b, 'title'))

/** Every published document of a collection with its body, by `order` then title */
export async function all(collection: string): Promise<Doc[]> {
  return [...(await getAllCMSContent(collection))].sort(byOrderThenTitle)
}

/** Every published document of a collection without its body, by `order` then title */
export async function summaries(collection: string): Promise<Summary[]> {
  return [...(await getAllCMSSummaries(collection))].sort(byOrderThenTitle)
}

/** The published fields of a global document (navigation, footer, announcement) */
export async function global(slug: string): Promise<Doc | undefined> {
  return maybe('globals', slug)
}

/** Navigation entries stored as "Label|/href" */
export function links(doc: Summary | undefined, name = 'links'): { label: string; href: string }[] {
  return list(doc, name)
    .map((entry) => {
      const [label = '', href = ''] = entry.split('|').map((part) => part.trim())
      return { label, href }
    })
    .filter((link) => link.label && link.href)
}

/** The variants of a code sample (snippets sharing `sample`), in order */
export async function sample(name: string): Promise<Doc[]> {
  const snippets = await all('snippets')
  return snippets.filter((snippet) => text(snippet, 'sample') === name)
}

/** The code inside a snippet's body: its first fenced block, or the whole body */
export function snippetCode(doc: Doc): string {
  const match = doc.rawContent.match(/```[^\n]*\n([\s\S]*?)```/)
  return (match?.[1] ?? doc.rawContent).replace(/\n$/, '')
}
