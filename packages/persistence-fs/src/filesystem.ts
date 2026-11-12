import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  type ContentMetadata,
  DEFAULT_FRONTMATTER_STATUS,
  type IContentLoader,
  renderContent,
  splitFrontmatter,
} from '@krantho/core'
import type {
  AuthoredMetadata,
  ContentDocument,
  ContentQuery,
  ContentStatus,
  DocumentMeta,
  IPersistenceAdapter,
  PersistenceConfig,
  QueryPage,
  QueryProjection,
  WriteContentData,
} from '@krantho/persistence'
import { authoredMetadata, repositoryFrontmatter, repositoryMarkdown } from '@krantho/persistence'
import matter from 'gray-matter'
import { type QueriedDocument, runContentQuery } from './content-query.js'

const DEFAULT_FS_CONFIG: PersistenceConfig = {
  contentPath: 'content/pages',
  seoPath: 'content/seo',
}

/** Construction options for {@link FileSystemAdapter} */
export interface FileSystemAdapterOptions extends Partial<PersistenceConfig> {
  /**
   * Each collection's directory, by collection name. A collection without one
   * keeps its files in `contentPath`.
   */
  directories?: ReadonlyMap<string, string> | undefined
  /**
   * Locale of a markdown file whose frontmatter declares none: the site's
   * default locale, `site.defaultLocale` in the krantho configuration.
   */
  defaultLocale: string
  /**
   * Status for a markdown file whose frontmatter declares none.
   *
   * A deployment sets this through `content.defaultStatus.filesystem`.
   */
  defaultStatus?: string | undefined
}

/** A file's publication state from its frontmatter status */
function fileState(status: string): ContentStatus {
  return status === 'published' || status === 'archived' ? status : 'draft'
}

/**
 * A file's document metadata. A file is one version with no history: it is
 * live when its status is published, so it can hold no changes ahead of what
 * visitors see — a save to a published file is live at once.
 */
function fileMeta(
  collection: string,
  slug: string,
  locale: string,
  status: string,
  modified: Date,
): DocumentMeta {
  const state = fileState(status)
  return {
    collection,
    slug,
    locale,
    version: 1,
    liveVersion: state === 'published' ? 1 : null,
    status: state,
    source: 'filesystem',
    changedBy: null,
    createdAt: modified.toISOString(),
  }
}

/** The status a write leaves a file in: publishing publishes, a save keeps the file's status */
function statusAfterWrite(data: WriteContentData, previous: string | undefined): string {
  if (data.publication === 'publish') return 'published'
  if (data.publication === 'unpublish') return 'draft'
  if (data.publication === 'archive') return 'archived'
  return previous ?? 'draft'
}

export class FileSystemAdapter implements IPersistenceAdapter, IContentLoader {
  private readonly contentPath: string
  private readonly directories: ReadonlyMap<string, string>
  private readonly defaultStatus: string
  private readonly defaultLocale: string

  constructor(config: FileSystemAdapterOptions) {
    const merged = { ...DEFAULT_FS_CONFIG, ...config }
    this.contentPath = merged.contentPath
    this.directories = config.directories ?? new Map()
    this.defaultLocale = config.defaultLocale
    this.defaultStatus = config.defaultStatus ?? DEFAULT_FRONTMATTER_STATUS
  }

  async exists(slug: string): Promise<boolean> {
    try {
      await fs.access(this.resolveContentPath(slug))
      return true
    } catch {
      return false
    }
  }

  async read(slug: string): Promise<string> {
    return fs.readFile(this.resolveContentPath(slug), 'utf-8')
  }

  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> {
    const stat = await fs.stat(this.resolveContentPath(slug))
    return {
      size: stat.size,
      lastModified: stat.mtime,
    }
  }

  async listSlugs(): Promise<string[]> {
    return slugsIn(this.contentPath)
  }

  /** The document of a collection's file, whatever locale is named: a file holds one document */
  async getContent(
    collection: string,
    slug: string,
    _locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    try {
      return await this.readDocument(collection, slug)
    } catch {
      return null
    }
  }

  /** A file is live when its status (frontmatter, or the default) is published */
  async getPublished(
    collection: string,
    slug: string,
    locale?: string | undefined,
  ): Promise<ContentDocument | null> {
    const doc = await this.getContent(collection, slug, locale)
    return doc?.meta.status === 'published' ? doc : null
  }

  /** The one read behind every list, over the files of the collections the adapter has a directory for */
  async query<P extends QueryProjection>(spec: ContentQuery<P>): Promise<QueryPage<P>> {
    return runContentQuery(
      {
        collections: () => [...this.directories.keys()],
        slugs: (collection) => slugsIn(this.directoryOf(collection)),
        read: (collection, slug, render) => this.readFile(collection, slug, render),
      },
      spec,
    )
  }

  async writeContent(data: WriteContentData): Promise<void> {
    const filePath = this.filePath(data.collection, data.slug)
    const previous = await this.getContent(data.collection, data.slug)
    // Merge content fields + the status back into YAML frontmatter for file storage
    const content = repositoryMarkdown({
      identity: {
        collection: data.collection,
        slug: data.slug,
        locale: data.locale ?? this.defaultLocale,
      },
      fields: { ...data.fields, status: statusAfterWrite(data, previous?.meta.status) },
      body: data.body,
      metadata: data.metadata ?? {},
      contract: data.contract ?? null,
      defaults: data.defaults ?? [],
    })
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  /** Removes the collection's file, whatever locale is named: a file holds one document */
  async deleteContent(
    collection: string,
    slug: string,
    _locale?: string | undefined,
  ): Promise<void> {
    await fs.unlink(this.filePath(collection, slug))
  }

  /** A collection's file, parsed and rendered as the content import renders it */
  private async readDocument(collection: string, slug: string): Promise<ContentDocument> {
    return (await this.readFile(collection, slug, true)) as ContentDocument
  }

  /** A collection's file, parsed; rendered (HTML and sections) only when `render` is set */
  private async readFile(
    collection: string,
    slug: string,
    render: boolean,
  ): Promise<QueriedDocument> {
    const filePath = this.filePath(collection, slug)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(raw)
    const { fields, status, locale } = splitFrontmatter(
      parsed.data as Record<string, unknown>,
      this.defaultLocale,
      this.defaultStatus,
    )
    const stat = await fs.stat(filePath)
    const document: QueriedDocument = {
      meta: fileMeta(collection, slug, locale, status, stat.mtime),
      fields,
      ...authoredMetadata(repositoryFrontmatter(parsed.data) as Partial<AuthoredMetadata>),
      body: parsed.content,
    }
    if (!render) return document
    // As the content import renders a file, so both providers store the same HTML; pages
    // substitute @-notation when they render
    const { html, sections } = await renderContent(fields, parsed.content, { atNotation: false })
    return { ...document, html, sections }
  }

  private directoryOf(collection: string): string {
    return this.directories.get(collection) ?? this.contentPath
  }

  private filePath(collection: string, slug: string): string {
    return path.join(this.directoryOf(collection), `${slug}.md`)
  }

  private resolveContentPath(slug: string): string {
    return path.join(this.contentPath, `${slug}.md`)
  }
}

/** The slugs of the markdown files in a directory; none when the directory does not exist yet */
async function slugsIn(directory: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.slice(0, -3))
}
