import { getAllCMSContent, getCMSContent } from '@krantho/ui-react/server'
import type { CMSContent } from '@krantho/ui-react/server'
import { requirePublished } from './krantho'

// Typed reads over the content templates. Every read goes through the krantho
// loader: published versions only, cached until a change in /studio refreshes
// the pages that read it.

export type Doc = CMSContent

/** A string field, or '' when unset */
export function text(doc: Doc | undefined, name: string): string {
  const value = doc?.fields[name]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** A string-array field, or [] when unset */
export function list(doc: Doc | undefined, name: string): string[] {
  const value = doc?.fields[name]
  return Array.isArray(value) ? value.map(String) : []
}

/** A number field, or the fallback */
export function num(doc: Doc | undefined, name: string, fallback = 99): number {
  const value = Number(doc?.fields[name])
  return Number.isFinite(value) ? value : fallback
}

/** A published document; 404 when it has none */
export function page(collection: string, slug: string): Promise<Doc> {
  return requirePublished(collection, slug)
}

/** A published document, or undefined — for optional reads such as globals and references */
export async function maybe(collection: string, slug: string): Promise<Doc | undefined> {
  if (!slug) return undefined
  try {
    return await getCMSContent(collection, slug)
  } catch {
    return undefined
  }
}

/** Every published document of a collection, by `order` then title */
export async function all(collection: string): Promise<Doc[]> {
  const docs = await getAllCMSContent(collection)
  return [...docs].sort(
    (a, b) => num(a, 'order') - num(b, 'order') || text(a, 'title').localeCompare(text(b, 'title')),
  )
}

/** Entries stored as "Label|/href" */
export function links(doc: Doc | undefined, name = 'links'): { label: string; href: string }[] {
  return list(doc, name)
    .map((entry) => {
      const [label = '', href = ''] = entry.split('|').map((part) => part.trim())
      return { label, href }
    })
    .filter((link) => link.label && link.href)
}

/**
 * The URL of a media field's image at a preset width, optionally cropped to an
 * aspect ratio such as '16:9'. It follows a replaced image; the format is
 * negotiated from the browser.
 */
export function imageUrl(
  id: string,
  preset: 'sm' | 'md' | 'lg' | 'xl' = 'lg',
  aspect?: string,
): string {
  const url = `/api/media/${encodeURIComponent(id)}/image?preset=${preset}`
  return aspect ? `${url}&aspect=${aspect}` : url
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in content */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
