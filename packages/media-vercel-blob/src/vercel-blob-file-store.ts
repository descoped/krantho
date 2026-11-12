import type { VercelBlobMediaSection } from '@krantho/config'
import type { IFileStore, StoredFile } from '@krantho/persistence'
import type { CopyCommandOptions } from '@vercel/blob'
import { copy, del, get, put } from '@vercel/blob'

/** Keys never change content, so objects are cached for a year */
const ONE_YEAR_SECONDS = 31536000

/** File store on a public Vercel Blob store; every call passes the configured token */
class VercelBlobFileStore implements IFileStore {
  readonly label = 'Vercel Blob'
  readonly location = null

  constructor(private readonly token: string) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile> {
    const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const result = await put(key, body, this.writeOptions(contentType))
    return { key, url: result.url }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const result = await get(key, { access: 'public', token: this.token })
    if (result === null) return null
    if (result.statusCode !== 200) {
      throw new Error(`Vercel Blob returned ${result.statusCode} for ${key}`)
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer())
  }

  async copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile> {
    const result = await copy(fromKey, toKey, this.writeOptions(contentType))
    return { key: toKey, url: result.url }
  }

  async delete(key: string): Promise<void> {
    await del(key, { token: this.token })
  }

  private writeOptions(contentType: string): CopyCommandOptions {
    return {
      access: 'public',
      token: this.token,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: ONE_YEAR_SECONDS,
    }
  }
}

export function createVercelBlobFileStore(section: VercelBlobMediaSection): IFileStore {
  if (section.token === undefined) {
    throw new Error('media.vercelBlob.token: required when media.provider is "vercel-blob"')
  }
  return new VercelBlobFileStore(section.token)
}
