import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { S3MediaSection } from '@krantho/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createS3FileStore } from '../src/index.js'

const BYTES = new Uint8Array([1, 2, 3, 4])
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const AWS: S3MediaSection = {
  bucket: 'media-bucket',
  region: 'eu-north-1',
  forcePathStyle: false,
  publicUrl: 'https://media-bucket.s3.eu-north-1.amazonaws.com',
}

interface Sent {
  client: S3Client
  command: unknown
}

let sent: Sent[]
let respond: (command: unknown) => unknown

beforeEach(() => {
  sent = []
  respond = () => ({})
  const send = async function (this: S3Client, command: unknown): Promise<unknown> {
    sent.push({ client: this, command })
    return respond(command)
  }
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(send as unknown as S3Client['send'])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function lastSent(): Sent {
  const last = sent.at(-1)
  if (last === undefined) throw new Error('no command was sent')
  return last
}

describe('createS3FileStore', () => {
  it('should describe itself as S3 at its bucket', () => {
    const store = createS3FileStore(AWS)
    expect(store.label).toBe('S3')
    expect(store.location).toBe('media-bucket')
  })

  it.each([
    ['bucket', 'media.s3.bucket'],
    ['region', 'media.s3.region'],
    ['publicUrl', 'media.s3.publicUrl'],
  ] as const)('should refuse to build without %s', (field, path) => {
    expect(() => createS3FileStore({ ...AWS, [field]: undefined })).toThrow(path)
  })

  it('should put with the content type and one-year cache control', async () => {
    const stored = await createS3FileStore(AWS).put('a.png', BYTES, 'image/png')

    expect(stored).toEqual({ key: 'a.png', url: `${AWS.publicUrl}/a.png` })
    const { command } = lastSent()
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'media-bucket',
      Key: 'a.png',
      Body: BYTES,
      ContentType: 'image/png',
      CacheControl: CACHE_CONTROL,
    })
  })

  it('should copy with an encoded source and replaced metadata', async () => {
    const stored = await createS3FileStore(AWS).copy('1-a b.png', '2-b.png', 'image/png')

    expect(stored).toEqual({ key: '2-b.png', url: `${AWS.publicUrl}/2-b.png` })
    const { command } = lastSent()
    expect(command).toBeInstanceOf(CopyObjectCommand)
    expect((command as CopyObjectCommand).input).toEqual({
      Bucket: 'media-bucket',
      Key: '2-b.png',
      CopySource: 'media-bucket/1-a%20b.png',
      MetadataDirective: 'REPLACE',
      ContentType: 'image/png',
      CacheControl: CACHE_CONTROL,
    })
  })

  it('should get the object bytes', async () => {
    respond = () => ({ Body: { transformToByteArray: async () => BYTES } })
    expect(await createS3FileStore(AWS).get('a.png')).toEqual(BYTES)

    const { command } = lastSent()
    expect(command).toBeInstanceOf(GetObjectCommand)
    expect((command as GetObjectCommand).input).toEqual({ Bucket: 'media-bucket', Key: 'a.png' })
  })

  it('should return null for NoSuchKey', async () => {
    respond = () => {
      throw new NoSuchKey({ message: 'The specified key does not exist.', $metadata: {} })
    }
    expect(await createS3FileStore(AWS).get('missing.png')).toBeNull()
  })

  it('should propagate other errors from get', async () => {
    respond = () => {
      throw new Error('AccessDenied')
    }
    await expect(createS3FileStore(AWS).get('a.png')).rejects.toThrow('AccessDenied')
  })

  it('should delete the object', async () => {
    await createS3FileStore(AWS).delete('a.png')
    const { command } = lastSent()
    expect(command).toBeInstanceOf(DeleteObjectCommand)
    expect((command as DeleteObjectCommand).input).toEqual({ Bucket: 'media-bucket', Key: 'a.png' })
  })

  it('should build the client with endpoint and path-style addressing', async () => {
    const r2: S3MediaSection = {
      bucket: 'media',
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      forcePathStyle: true,
      publicUrl: 'https://media.example.com/',
    }
    const stored = await createS3FileStore(r2).put('a.png', BYTES, 'image/png')

    expect(stored.url).toBe('https://media.example.com/a.png')
    const { client } = lastSent()
    expect(client.config.forcePathStyle).toBe(true)
    expect(await client.config.region()).toBe('auto')
    expect(await client.config.endpoint?.()).toMatchObject({
      hostname: 'account.r2.cloudflarestorage.com',
      protocol: 'https:',
    })
  })

  it('should use explicit credentials when both keys are set', async () => {
    const section = { ...AWS, accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }
    await createS3FileStore(section).delete('a.png')

    const credentials = await lastSent().client.config.credentials()
    expect(credentials).toMatchObject({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' })
  })

  it('should fall back to the default credential chain without keys', async () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIDFROMENV')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'env-secret')
    await createS3FileStore(AWS).delete('a.png')

    const { client } = lastSent()
    expect(client.config.endpoint).toBeUndefined()
    const credentials = await client.config.credentials()
    expect(credentials).toMatchObject({ accessKeyId: 'AKIDFROMENV', secretAccessKey: 'env-secret' })
  })
})
