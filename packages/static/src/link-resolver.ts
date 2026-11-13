import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { documentPath, slugOfFile } from '@krantho/core'
import type { Collection } from '@krantho/schema'

/** The document a link was written in */
export interface LinkSource {
  collection: string
  slug: string
}

/** What a resolver reads of a collection: its files and where its pages are */
export type LinkCollection = Pick<Collection, 'name' | 'directory' | 'indexFile' | 'path'>

/** Rewrites a URL as written in a document's markdown to the address it names on the site */
export type LinkResolver = (url: string, source: LinkSource) => string

/** A URL with a scheme (`https:`, `mailto:`), protocol-relative (`//host`), root-relative or anchor-only */
function isAddress(url: string): boolean {
  return url === '' || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')
}

/** `setup.md#install` → `['setup.md', '#install']` */
function splitSuffix(url: string): [string, string] {
  const at = url.search(/[?#]/)
  return at === -1 ? [url, ''] : [url.slice(0, at), url.slice(at)]
}

function decoded(path: string): string {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

/** The path of `target` inside `directory`, with forward slashes, or null when it is outside */
function inside(directory: string, target: string): string | null {
  const path = relative(directory, target)
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return null
  return path.split(sep).join('/')
}

/**
 * A resolver for links between a site's markdown files, so a folder of docs
 * reads the same on GitHub and on the site. A URL relative to the document's
 * file is rewritten:
 *
 * - to another document's file (`setup.md#install`, `README.md`): that
 *   document's page (`/setup/#install`, `/`), in any collection whose
 *   directory holds the file;
 * - to any other file in the document's collection directory
 *   (`images/flow.png`): its path from that directory, root-relative
 *   (`/images/flow.png`), where the site's `public/` folder serves it.
 *
 * Absolute, root-relative and anchor-only URLs, and relative ones to a file
 * outside the collection directory or to a document without a page, are left
 * as written.
 */
export function createLinkResolver(collections: Iterable<LinkCollection>): LinkResolver {
  const byName = new Map<string, LinkCollection>()
  const byDirectory = new Map<string, LinkCollection>()
  for (const collection of collections) {
    byName.set(collection.name, collection)
    if (collection.directory) byDirectory.set(resolve(collection.directory), collection)
  }

  return (url, source) => {
    if (isAddress(url)) return url
    const directory = byName.get(source.collection)?.directory
    if (!directory) return url
    const [path, suffix] = splitSuffix(url)
    const target = resolve(directory, decoded(path))

    const owner = byDirectory.get(dirname(target))
    const slug = owner ? slugOfFile(owner, basename(target)) : null
    if (owner && slug !== null) {
      const page = documentPath(owner, slug)
      return page === null ? url : `${page}${suffix}`
    }
    if (target.endsWith('.md')) return url
    const asset = inside(resolve(directory), target)
    return asset === null ? url : `/${encodeURI(asset)}${suffix}`
  }
}
