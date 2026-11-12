import type { S3ClientConfig } from '@aws-sdk/client-s3'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { S3MediaSection } from '@krantho/config'
import type { IFileStore, StoredFile } from '@krantho/persistence'

/** Keys never change content, so objects are cached for a year */
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

interface S3Target {
  bucket: string
  publicUrl: string
}

/** File store on an S3-compatible bucket whose objects are public at `publicUrl` */
class S3FileStore implements IFileStore {
  readonly label = 'S3'
  readonly location: string
  private readonly publicUrl: string

  constructor(
    private readonly client: S3Client,
    target: S3Target,
  ) {
    this.location = target.bucket
    this.publicUrl = target.publicUrl.replace(/\/+$/, '')
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.location,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    )
    return this.stored(key)
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.location, Key: key }),
      )
      if (result.Body === undefined) return null
      return await result.Body.transformToByteArray()
    } catch (error) {
      if (error instanceof NoSuchKey) return null
      throw error
    }
  }

  async copy(fromKey: string, toKey: string, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.location,
        Key: toKey,
        CopySource: `${this.location}/${encodeURIComponent(fromKey)}`,
        MetadataDirective: 'REPLACE',
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    )
    return this.stored(toKey)
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.location, Key: key }))
  }

  private stored(key: string): StoredFile {
    return { key, url: `${this.publicUrl}/${key}` }
  }
}

function required(value: string | undefined, path: string): string {
  if (value === undefined) throw new Error(`${path}: required when media.provider is "s3"`)
  return value
}

/** Client options from config; without a key pair the SDK uses its default credential chain */
function clientConfig(section: S3MediaSection, region: string): S3ClientConfig {
  const config: S3ClientConfig = { region, forcePathStyle: section.forcePathStyle }
  if (section.endpoint !== undefined) config.endpoint = section.endpoint
  if (section.accessKeyId !== undefined && section.secretAccessKey !== undefined) {
    config.credentials = {
      accessKeyId: section.accessKeyId,
      secretAccessKey: section.secretAccessKey,
    }
  }
  return config
}

export function createS3FileStore(section: S3MediaSection): IFileStore {
  const bucket = required(section.bucket, 'media.s3.bucket')
  const region = required(section.region, 'media.s3.region')
  const publicUrl = required(section.publicUrl, 'media.s3.publicUrl')
  const client = new S3Client(clientConfig(section, region))
  return new S3FileStore(client, { bucket, publicUrl })
}
