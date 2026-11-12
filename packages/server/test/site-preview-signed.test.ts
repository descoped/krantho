import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KranthoConfig, KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES, resolveConfig } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'
import { verifyPreviewRequest } from '../src/preview-token.js'

/**
 * A host without a draft mode of its own (SvelteKit, Express) previews through
 * signed URLs: `GET /api/preview` sends an editor to the page with a
 * short-lived token bound to that page's path, and the page's server checks it
 * with `verifyPreviewRequest()`.
 */

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))
const jwtSecret = 'signed-preview-test-secret-that-is-long-enough'
const site = {
  domain: 'localhost',
  name: 'Signed preview',
  language: 'en',
  baseUrl: 'http://localhost:4004',
}
const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: join(fixtures, 'pages'),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

let dataDir: string
let input: KranthoConfigInput
let config: KranthoConfig
let handler: KranthoHandler
const savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-signed-preview-')), 'data')
  input = {
    site,
    paths: { dataDir },
    auth: { mode: 'token', jwtSecret, token: { secret: 'shared-secret' } },
  }
  config = resolveConfig(input, {})
  handler = await createKranthoHandler({ config: input, collections, sitePreview: 'signed-url' })
})

afterEach(() => {
  vi.useRealTimers()
  handler.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
})

/** An access token in the shape the API issues */
function accessToken(roles: string[]): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ sub: 'u1', email: 'e@example.com', roles, exp: Date.now() / 1000 + 300 })
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

function preview(slug: string, roles?: string[]): Promise<Response> {
  return handler.handle(
    new Request(
      `http://localhost/api/preview?${new URLSearchParams({ collection: 'pages', slug })}`,
      {
        headers: roles ? { authorization: `Bearer ${accessToken(roles)}` } : {},
      },
    ),
  )
}

/** The page URL an editor is sent to for `slug` */
async function previewUrl(slug: string): Promise<URL> {
  const response = await preview(slug, ['editor'])
  expect(response.status).toBe(307)
  return new URL(response.headers.get('location') ?? '', 'http://site.example')
}

/** The same URL with a different preview token */
function withToken(url: URL, token: string): URL {
  const copy = new URL(url)
  copy.searchParams.set('krantho-preview', token)
  return copy
}

describe('signed-url site preview', () => {
  it('sends an editor to the page with a token, uncached', async () => {
    const response = await preview('about', ['editor'])
    expect(response.status).toBe(307)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const location = response.headers.get('location') ?? ''
    expect(location).toMatch(/^\/about\?krantho-preview=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(verifyPreviewRequest(new URL(location, 'http://site.example'), config)).toBe(true)

    expect(new URL(location, 'http://site.example').origin).toBe('http://site.example')

    const home = await previewUrl('home')
    expect(home.origin).toBe('http://site.example')
    expect(home.pathname).toBe('/')
    expect(verifyPreviewRequest(home, config)).toBe(true)
  })

  it('never sends the editor off the site', async () => {
    const hostile = [
      '..//evil.com',
      '.././/evil.com',
      'a/../..//evil.com',
      '..///evil.com',
      '../\\evil.com',
      '..\\\\evil.com',
      '..//evil.com/x',
    ]
    for (const slug of hostile) {
      const response = await preview(slug, ['editor'])
      expect(response.status, slug).toBe(400)
      expect(response.headers.get('location'), slug).toBeNull()
    }
  })

  it('refuses viewers and anonymous requests', async () => {
    expect((await preview('about')).status).toBe(403)
    const viewer = await preview('about', ['viewer'])
    expect(viewer.status).toBe(403)
    expect(viewer.headers.get('location')).toBeNull()
  })

  it('reports the mode as a capability', async () => {
    const response = await handler.handle(new Request('http://localhost/api/capabilities'))
    const { features } = (await response.json()) as { features: Record<string, string> }
    expect(features['sitePreview']).toBe('signed-url')
  })

  it('verifies a link signed with the ephemeral secret when none is configured', async () => {
    const auth = { ...config.auth }
    delete auth.jwtSecret
    const unconfigured = { ...config, auth }
    const signer = await createKranthoHandler({
      config: { site, paths: { dataDir: join(dataDir, 'unconfigured') }, auth: { mode: 'none' } },
      collections,
      sitePreview: 'signed-url',
    })
    const response = await signer.handle(
      new Request('http://localhost/api/preview?collection=pages&slug=about'),
    )
    const link = new URL(response.headers.get('location') ?? '', 'http://localhost')

    expect(verifyPreviewRequest(link, unconfigured)).toBe(true)
    expect(verifyPreviewRequest(new URL('/contact?krantho-preview=x', link), unconfigured)).toBe(
      false,
    )
    signer.close()
  })

  it('binds the token to its path', async () => {
    const about = await previewUrl('about')
    const token = about.searchParams.get('krantho-preview') ?? ''
    for (const path of ['/contact', '/about/', '/about/x', '/', '/About']) {
      const other = new URL(`${path}?krantho-preview=${token}`, 'http://site.example')
      expect(verifyPreviewRequest(other, config)).toBe(false)
    }
    // The query besides the token does not matter; the host does not either
    const extra = new URL(`http://other.example/about?page=2&krantho-preview=${token}`)
    expect(verifyPreviewRequest(extra, config)).toBe(true)
  })

  it('expires after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const about = await previewUrl('about')

    vi.setSystemTime(start + 9 * 60 * 1000)
    expect(verifyPreviewRequest(about, config)).toBe(true)
    vi.setSystemTime(start + 10 * 60 * 1000 + 1000)
    expect(verifyPreviewRequest(about, config)).toBe(false)
  })

  it('rejects a tampered token', async () => {
    const about = await previewUrl('about')
    const token = about.searchParams.get('krantho-preview') ?? ''
    const [expPart, mac] = token.split('.') as [string, string]

    // A later expiry under the original signature
    const exp = Number(Buffer.from(expPart, 'base64url').toString()) + 3600
    const later = `${Buffer.from(String(exp)).toString('base64url')}.${mac}`
    expect(verifyPreviewRequest(withToken(about, later), config)).toBe(false)

    // One flipped signature character
    const flipped = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`
    expect(verifyPreviewRequest(withToken(about, `${expPart}.${flipped}`), config)).toBe(false)

    // The same expiry spelled another way: leading zeros, or other base64 padding bits
    const expText = Buffer.from(expPart, 'base64url').toString()
    const zeros = `${Buffer.from(`00${expText}`).toString('base64url')}.${mac}`
    expect(verifyPreviewRequest(withToken(about, zeros), config)).toBe(false)
    // Flip an unused low bit of the last base64url character: same bytes, other spelling
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const last = alphabet.indexOf(expPart.slice(-1))
    const respelled = `${expPart.slice(0, -1)}${alphabet[last ^ 1]}`
    expect(Buffer.from(respelled, 'base64url').toString()).toBe(expText)
    expect(verifyPreviewRequest(withToken(about, `${respelled}.${mac}`), config)).toBe(false)

    // Signed with another secret
    const forged = createHmac('sha256', 'another-secret')
      .update(`/about|${Buffer.from(expPart, 'base64url').toString()}`)
      .digest('base64url')
    expect(verifyPreviewRequest(withToken(about, `${expPart}.${forged}`), config)).toBe(false)

    // A server with another secret
    const otherConfig = resolveConfig({ ...input, auth: { jwtSecret: 'another-secret' } }, {})
    expect(verifyPreviewRequest(about, otherConfig)).toBe(false)
  })

  it('rejects malformed tokens without throwing', async () => {
    const about = await previewUrl('about')
    const [expPart] = (about.searchParams.get('krantho-preview') ?? '').split('.') as [string]
    const malformed = [
      '',
      'x',
      '.',
      `${expPart}.`,
      `.${expPart}`,
      `${expPart}.a.b`,
      `${expPart}.!!!`,
      `${Buffer.from('-5').toString('base64url')}.abc`,
      `${Buffer.from('1e12').toString('base64url')}.abc`,
      `${Buffer.from('99999999999999999999').toString('base64url')}.abc`,
    ]
    for (const token of malformed) {
      expect(verifyPreviewRequest(withToken(about, token), config)).toBe(false)
    }
    expect(verifyPreviewRequest(new URL('http://site.example/about'), config)).toBe(false)
  })

  it('verifies nothing without a configured secret', async () => {
    const about = await previewUrl('about')
    expect(verifyPreviewRequest(about, resolveConfig({ site, paths: { dataDir } }, {}))).toBe(false)
  })
})
