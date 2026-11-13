/**
 * How a collection names its markdown files: each file is a document whose
 * slug is the file name without `.md`. A collection may name the file read as
 * its `index` document instead of `index.md` — `README.md`, the file GitHub
 * shows for a folder — so one folder of docs reads well on GitHub and on the
 * site.
 */
export interface ContentFileNaming {
  /** The file read as the `index` document (`README.md`); unset, `index.md` */
  readonly indexFile?: string | undefined
}

/** The slug of a collection's home document */
export const INDEX_SLUG = 'index'

/**
 * The slug of a collection's file, or null when the file is not one of its
 * documents: not markdown, or `index.md` in a collection that reads another
 * file as its index
 */
export function slugOfFile(collection: ContentFileNaming, fileName: string): string | null {
  if (!fileName.endsWith('.md')) return null
  const { indexFile } = collection
  if (indexFile) {
    if (fileName === indexFile) return INDEX_SLUG
    if (fileName === `${INDEX_SLUG}.md`) return null
  }
  return fileName.slice(0, -3)
}

/** The file name of a collection's document */
export function fileNameOf(collection: ContentFileNaming, slug: string): string {
  return slug === INDEX_SLUG && collection.indexFile ? collection.indexFile : `${slug}.md`
}
