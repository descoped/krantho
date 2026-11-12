/**
 * Client-side content loader adapter for unified CMS Core Engine
 * Implements the IContentLoader interface using fetch API
 */

import type { ContentMetadata, IContentLoader } from '../types'

export class ClientFetchLoader implements IContentLoader {
  constructor(private contentPath: string) {}

  async exists(slug: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.contentPath}/${slug}.md`, { method: 'HEAD' })
      return response.ok
    } catch {
      return false
    }
  }

  async read(slug: string): Promise<string> {
    try {
      const response = await fetch(`${this.contentPath}/${slug}.md`)
      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`)
      }
      return await response.text()
    } catch (error) {
      throw new Error(
        `Failed to read content for slug "${slug}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  async getMetadata(slug: string): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> {
    try {
      const response = await fetch(`${this.contentPath}/${slug}.md`, { method: 'HEAD' })
      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.status} ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      const lastModified = response.headers.get('last-modified')

      return {
        size: contentLength ? parseInt(contentLength, 10) : 0,
        lastModified: lastModified ? new Date(lastModified) : new Date(),
      }
    } catch (error) {
      throw new Error(
        `Failed to get metadata for slug "${slug}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
}
