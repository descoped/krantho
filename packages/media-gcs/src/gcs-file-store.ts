import type { GcsMediaSection } from '@krantho/config'
import type { IFileStore, StoredFile } from '@krantho/persistence'
import type { AccessTokenSource } from './gcs-token.js'
import { createAccessTokenSource } from './gcs-token.js'

const API = 'https://storage.googleapis.com/storage/v1'
const UPLOAD_API = 'https://storage.googleapis.com/upload/storage/v1'

/** File store on a Google Cloud Storage bucket through the JSON API, with no SDK */
class GcsFileStore implements IFileStore {
  readonly label = 'Google Cloud Storage'
  readonly location: string
  private readonly publicUrl: string

  constructor(
    bucket: string,
    publicUrl: string,
    private readonly token: AccessTokenSource,
  ) {
    this.location = bucket
    this.publicUrl = publicUrl.replace(/\/+$/, '')
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile> {
    const url = `${UPLOAD_API}/b/${this.location}/o?uploadType=media&name=${encodeURIComponent(key)}`
    const response = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: new Uint8Array(bytes),
    })
    await expectOk(response, 'upload', key)
    return this.stored(key)
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this.request(`${this.objectUrl(key)}?alt=media`, { method: 'GET' })
    if (response.status === 404) return null
    await expectOk(response, 'download', key)
    return new Uint8Array(await response.arrayBuffer())
  }

  async copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile> {
    const target = `b/${this.location}/o/${encodeURIComponent(toKey)}`
    const response = await this.request(`${this.objectUrl(fromKey)}/copyTo/${target}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType }),
    })
    await expectOk(response, 'copy', fromKey)
    return this.stored(toKey)
  }

  async delete(key: string): Promise<void> {
    const response = await this.request(this.objectUrl(key), { method: 'DELETE' })
    if (response.status === 404) return
    await expectOk(response, 'delete', key)
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${await this.token()}`)
    return fetch(url, { ...init, headers })
  }

  private objectUrl(key: string): string {
    return `${API}/b/${this.location}/o/${encodeURIComponent(key)}`
  }

  private stored(key: string): StoredFile {
    return { key, url: `${this.publicUrl}/${key}` }
  }
}

async function expectOk(response: Response, operation: string, key: string): Promise<void> {
  if (response.ok) return
  const detail = await response.text().catch(() => '')
  throw new Error(`GCS ${operation} of ${key} failed: ${response.status} ${detail}`.trim())
}

function required(value: string | undefined, path: string): string {
  if (value === undefined) throw new Error(`${path}: required when media.provider is "gcs"`)
  return value
}

export function createGcsFileStore(section: GcsMediaSection): IFileStore {
  const bucket = required(section.bucket, 'media.gcs.bucket')
  const publicUrl = required(section.publicUrl, 'media.gcs.publicUrl')
  return new GcsFileStore(bucket, publicUrl, createAccessTokenSource(section.credentials))
}
