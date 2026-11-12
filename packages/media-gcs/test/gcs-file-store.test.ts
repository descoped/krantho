import { createVerify, generateKeyPairSync } from 'node:crypto'
import type { GcsMediaSection } from '@krantho/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGcsFileStore } from '../src/index.js'

const METADATA_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
const OAUTH_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://storage.googleapis.com/storage/v1/b/media-bucket/o'
const UPLOAD_API = 'https://storage.googleapis.com/upload/storage/v1/b/media-bucket/o'
const BYTES = new Uint8Array([1, 2, 3, 4])

const SECTION: GcsMediaSection = {
  bucket: 'media-bucket',
  publicUrl: 'https://storage.googleapis.com/media-bucket',
}

interface Call {
  url: string
  method: string
  headers: Headers
  body: RequestInit['body']
}

let calls: Call[]
let respond: (call: Call) => Response

function tokenResponse(token: string): Response {
  return Response.json({ access_token: token, expires_in: 3600, token_type: 'Bearer' })
}

function defaultRespond(call: Call): Response {
  if (call.url === METADATA_URL) return tokenResponse('metadata-token')
  if (call.url === OAUTH_URL) return tokenResponse('sa-token')
  return Response.json({})
}

beforeEach(() => {
  calls = []
  respond = defaultRespond
  const fetchStub = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    }
    calls.push(call)
    return respond(call)
  }
  vi.stubGlobal('fetch', vi.fn(fetchStub))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function storageCalls(): Call[] {
  return calls.filter((call) => call.url !== METADATA_URL && call.url !== OAUTH_URL)
}

function lastStorageCall(): Call {
  const call = storageCalls().at(-1)
  if (call === undefined) throw new Error('no storage request was sent')
  return call
}

describe('createGcsFileStore', () => {
  it('should describe itself as Google Cloud Storage at its bucket', () => {
    const store = createGcsFileStore(SECTION)
    expect(store.label).toBe('Google Cloud Storage')
    expect(store.location).toBe('media-bucket')
  })

  it.each([
    ['bucket', 'media.gcs.bucket'],
    ['publicUrl', 'media.gcs.publicUrl'],
  ] as const)('should refuse to build without %s', (field, path) => {
    expect(() => createGcsFileStore({ ...SECTION, [field]: undefined })).toThrow(path)
  })

  it('should reject credentials that are not a service-account key', () => {
    expect(() => createGcsFileStore({ ...SECTION, credentials: '{nope' })).toThrow('not valid JSON')
    expect(() => createGcsFileStore({ ...SECTION, credentials: '{"type":"x"}' })).toThrow(
      'client_email and private_key',
    )
  })

  it('should upload with an encoded name, bearer token and content type', async () => {
    const stored = await createGcsFileStore(SECTION).put('1-a b.png', BYTES, 'image/png')

    expect(stored).toEqual({ key: '1-a b.png', url: `${SECTION.publicUrl}/1-a b.png` })
    const call = lastStorageCall()
    expect(call.url).toBe(`${UPLOAD_API}?uploadType=media&name=1-a%20b.png`)
    expect(call.method).toBe('POST')
    expect(call.headers.get('authorization')).toBe('Bearer metadata-token')
    expect(call.headers.get('content-type')).toBe('image/png')
    expect(call.body).toEqual(BYTES)
  })

  it('should fetch the metadata-server token with Metadata-Flavor: Google', async () => {
    await createGcsFileStore(SECTION).put('a.png', BYTES, 'image/png')

    const tokenCall = calls[0]
    expect(tokenCall?.url).toBe(METADATA_URL)
    expect(tokenCall?.headers.get('metadata-flavor')).toBe('Google')
  })

  it('should fail when the token request fails', async () => {
    respond = (call) =>
      call.url === METADATA_URL ? new Response('', { status: 404 }) : Response.json({})
    await expect(createGcsFileStore(SECTION).put('a.png', BYTES, 'image/png')).rejects.toThrow(
      'Metadata server token request failed: 404',
    )
  })

  it('should get object bytes with alt=media', async () => {
    respond = (call) => (call.url.startsWith(API) ? new Response(BYTES) : defaultRespond(call))
    expect(await createGcsFileStore(SECTION).get('a.png')).toEqual(BYTES)
    expect(lastStorageCall().url).toBe(`${API}/a.png?alt=media`)
  })

  it('should return null when get answers 404', async () => {
    respond = (call) =>
      call.url.startsWith(API) ? new Response('', { status: 404 }) : defaultRespond(call)
    expect(await createGcsFileStore(SECTION).get('missing.png')).toBeNull()
  })

  it('should throw when get answers another error', async () => {
    respond = (call) =>
      call.url.startsWith(API) ? new Response('denied', { status: 403 }) : defaultRespond(call)
    await expect(createGcsFileStore(SECTION).get('a.png')).rejects.toThrow('403 denied')
  })

  it('should copy to a new object with the content type', async () => {
    const stored = await createGcsFileStore(SECTION).copy('a.png', 'b.png', 'image/png')

    expect(stored).toEqual({ key: 'b.png', url: `${SECTION.publicUrl}/b.png` })
    const call = lastStorageCall()
    expect(call.url).toBe(`${API}/a.png/copyTo/b/media-bucket/o/b.png`)
    expect(call.method).toBe('POST')
    expect(JSON.parse(String(call.body))).toEqual({ contentType: 'image/png' })
  })

  it('should delete the object and accept 404', async () => {
    const store = createGcsFileStore(SECTION)
    await store.delete('a.png')
    expect(lastStorageCall()).toMatchObject({ url: `${API}/a.png`, method: 'DELETE' })

    respond = (call) =>
      call.url.startsWith(API) ? new Response('', { status: 404 }) : defaultRespond(call)
    await expect(store.delete('gone.png')).resolves.toBeUndefined()
  })
})

describe('service-account tokens', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const credentials = JSON.stringify({
    type: 'service_account',
    client_email: 'krantho@project.iam.gserviceaccount.com',
    private_key: privateKey,
  })

  function assertionOf(call: Call): string {
    const form = new URLSearchParams(String(call.body))
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const assertion = form.get('assertion')
    if (assertion === null) throw new Error('no assertion was posted')
    return assertion
  }

  it('should post a signed jwt-bearer grant with the right claims', async () => {
    await createGcsFileStore({ ...SECTION, credentials }).put('a.png', BYTES, 'image/png')

    const tokenCall = calls.find((call) => call.url === OAUTH_URL)
    if (tokenCall === undefined) throw new Error('no token request was sent')
    expect(tokenCall.method).toBe('POST')
    expect(tokenCall.headers.get('content-type')).toBe('application/x-www-form-urlencoded')

    const [header = '', claims = '', signature = ''] = assertionOf(tokenCall).split('.')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${claims}`)
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true)

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString()) as Record<
      string,
      number
    >
    expect(payload).toMatchObject({
      iss: 'krantho@project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: OAUTH_URL,
    })
    expect(Number(payload.exp) - Number(payload.iat)).toBe(3600)
    expect(lastStorageCall().headers.get('authorization')).toBe('Bearer sa-token')
    expect(calls.some((call) => call.url === METADATA_URL)).toBe(false)
  })

  it('should cache the token until five minutes before it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    const store = createGcsFileStore({ ...SECTION, credentials })
    const tokenRequests = (): number => calls.filter((call) => call.url === OAUTH_URL).length

    await store.put('a.png', BYTES, 'image/png')
    await store.get('a.png')
    vi.setSystemTime(new Date('2026-09-30T12:54:59Z'))
    await store.delete('a.png')
    expect(tokenRequests()).toBe(1)

    vi.setSystemTime(new Date('2026-09-30T12:55:00Z'))
    await store.delete('a.png')
    expect(tokenRequests()).toBe(2)
  })
})
