import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * Media behaves the same on SQLite and Postgres: one scenario runs over HTTP
 * against each database, and the normalised responses must be equal.
 */

const site = {
  domain: 'localhost',
  name: 'Media Parity',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({ title: z.string(), image: z.string().optional() }),
})

/** A one-pixel PNG */
const PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g
const UPLOAD_URL = /\/uploads\/[a-z0-9._-]+/g
const REV = /rev=[0-9a-f]{12}/g

let container: StartedPostgreSqlContainer
const tempDirs: string[] = []
const savedEnv: Record<string, string | undefined> = {}

/** One recorded step: what the scenario did and what it got back */
interface Step {
  step: string
  status: number
  body: unknown
}

/** A running site plus the directory its files land in */
interface Site {
  handler: KranthoHandler
  uploads: string
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function startSite(persistence: KranthoConfigInput['persistence']): Promise<Site> {
  const root = tempDir('krantho-media-parity-')
  const uploads = join(root, 'uploads')
  const handler = await createKranthoHandler({
    config: {
      site,
      paths: { dataDir: join(root, 'data') },
      persistence,
      media: { provider: 'local', local: { dir: uploads } },
    },
    collections: { blog },
  })
  return { handler, uploads }
}

/** Mask what legitimately differs between runs: ids, timestamps, keys, revisions */
function normalise(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(UUID, '<id>')
      .replace(TIMESTAMP, '<ts>')
      .replace(UPLOAD_URL, '/uploads/<key>')
      .replace(REV, 'rev=<rev>')
  }
  if (Array.isArray(value)) return value.map(normalise)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]))
  }
  return value
}

/** Drives one site through the scenario and records every response */
class Scenario {
  readonly steps: Step[] = []

  constructor(private readonly site: Site) {}

  async call(step: string, method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = { method, redirect: 'manual' }
    if (body instanceof FormData) init.body = body
    else if (body !== undefined) {
      init.body = JSON.stringify(body)
      init.headers = { 'content-type': 'application/json' }
    }
    const response = await this.site.handler.handle(new Request(`http://localhost${path}`, init))
    await this.record(step, response.clone())
    return response
  }

  async json<T>(step: string, method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.call(step, method, path, body)).json()) as T
  }

  fileExists(url: string): boolean {
    return existsSync(join(this.site.uploads, url.slice('/uploads/'.length)))
  }

  private async record(step: string, response: Response): Promise<void> {
    const type = response.headers.get('content-type') ?? ''
    const location = response.headers.get('location')
    const body = type.includes('json') ? sortItems(await response.json()) : { type, location }
    this.steps.push({ step, status: response.status, body: normalise(body) })
  }
}

/** List order among same-millisecond uploads is not part of the contract */
function sortItems(body: unknown): unknown {
  if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)) {
    return body
  }
  const items = [...(body.items as Array<{ filename: string; altText: string }>)].sort((a, b) =>
    `${a.filename}${a.altText}`.localeCompare(`${b.filename}${b.altText}`),
  )
  return { ...body, items }
}

function pixelForm(name: string): FormData {
  const form = new FormData()
  form.append('file', new Blob([PIXEL], { type: 'image/png' }), name)
  return form
}

interface Item {
  id: string
  url: string
  filename: string
}

async function revOf(s: Scenario, step: string, id: string): Promise<string | null> {
  const response = await s.call(step, 'GET', `/api/media/${id}/image?preset=sm`)
  return new URL(response.headers.get('location') ?? '', 'http://localhost').searchParams.get('rev')
}

/** Upload, list, search, update, rename, variants */
async function libraryBasics(s: Scenario): Promise<Item> {
  const item = await s.json<Item>('upload', 'POST', '/api/media/upload', pixelForm('Pixel.png'))
  expect(s.fileExists(item.url)).toBe(true)
  await s.call('list', 'GET', '/api/media')
  await s.call('search hit', 'GET', '/api/media?search=pixel')
  await s.call('search miss', 'GET', '/api/media?search=nothing')
  await s.call('update', 'PUT', `/api/media/${item.id}`, {
    altText: 'A pixel',
    tags: ['dot', 'tiny'],
    crop: { x: 0, y: 0, width: 100, height: 100 },
  })
  const renamed = await s.json<Item>('rename', 'PUT', `/api/media/${item.id}`, {
    filename: 'Renamed pixel.png',
  })
  expect(renamed.url).toBe(item.url)
  expect(renamed.filename).toBe('Renamed pixel.png')

  const redirect = await s.call('stable image', 'GET', `/api/media/${item.id}/image?fmt=png`)
  const variant = await s.call('versioned image', 'GET', redirect.headers.get('location') ?? '')
  expect(variant.status).toBe(200)
  await s.call('tags', 'GET', '/api/media/tags')
  return renamed
}

/** Replace rewrites content that holds the old url and deletes the old file */
async function replaceFlow(s: Scenario, item: Item): Promise<void> {
  await s.call('post with image', 'POST', '/api/content/blog', {
    slug: 'post',
    fields: { title: 'Post', image: item.url },
  })
  const revBefore = await revOf(s, 'rev before replace', item.id)
  const replaced = await s.json<Item>(
    'replace',
    'POST',
    `/api/media/${item.id}/replace`,
    pixelForm('New pixel.png'),
  )

  expect(replaced.id).toBe(item.id)
  expect(replaced.url).not.toBe(item.url)
  expect(s.fileExists(item.url)).toBe(false)
  expect(s.fileExists(replaced.url)).toBe(true)
  expect(await revOf(s, 'rev after replace', item.id)).not.toBe(revBefore)

  const post = await s.json<{ fields: { image: string } }>(
    'post after replace',
    'GET',
    '/api/content/blog/post',
  )
  expect(post.fields.image).toBe(replaced.url)
}

/** Duplicate copies the file; delete removes it */
async function duplicateAndDelete(s: Scenario, id: string): Promise<void> {
  const copy = await s.json<Item>('duplicate', 'POST', `/api/media/${id}/duplicate`)
  expect(copy.id).not.toBe(id)
  expect(s.fileExists(copy.url)).toBe(true)
  await s.call('list after duplicate', 'GET', '/api/media')

  await s.call('delete copy', 'DELETE', `/api/media/${copy.id}`)
  expect(s.fileExists(copy.url)).toBe(false)
  await s.call('get deleted', 'GET', `/api/media/${copy.id}`)
  await s.call('register relative url', 'POST', '/api/media/register', {
    filename: 'x.png',
    url: '/uploads/x.png',
    mimeType: 'image/png',
    size: 1,
  })
}

/** Folder tree: create, nest, rename, move media in, refuse non-empty deletes */
async function folderFlow(s: Scenario, id: string): Promise<void> {
  const parent = await s.json<{ id: string }>('folder create', 'POST', '/api/media/folders', {
    name: 'Photos',
  })
  const child = await s.json<{ id: string }>('folder nested', 'POST', '/api/media/folders', {
    name: 'Summer',
    parentId: parent.id,
  })
  await s.call('folder missing parent', 'POST', '/api/media/folders', {
    name: 'Orphan',
    parentId: 'missing',
  })
  await s.call('folder rename', 'PUT', `/api/media/folders/${child.id}`, { name: 'Winter' })
  await s.call('folders', 'GET', '/api/media/folders')
  await s.call('move', 'PUT', `/api/media/${id}/move`, { folderId: child.id })
  await s.call('list folder', 'GET', `/api/media?folder=${child.id}`)
  await s.call('delete with children', 'DELETE', `/api/media/folders/${parent.id}`)
  await s.call('delete with media', 'DELETE', `/api/media/folders/${child.id}`)
  await s.call('move to root', 'PUT', `/api/media/${id}/move`, { folderId: null })
  await s.call('delete empty', 'DELETE', `/api/media/folders/${child.id}`)
  await s.call('folders after delete', 'GET', '/api/media/folders')
}

async function runScenario(site: Site): Promise<Step[]> {
  const s = new Scenario(site)
  const item = await libraryBasics(s)
  await replaceFlow(s, item)
  await duplicateAndDelete(s, item.id)
  await folderFlow(s, item.id)
  const capabilities = await site.handler.handle(new Request('http://localhost/api/capabilities'))
  const { features } = (await capabilities.json()) as { features: Record<string, string> }
  s.steps.push({ step: 'capabilities', status: capabilities.status, body: features })
  site.handler.close()
  return s.steps
}

beforeAll(async () => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('krantho_media')
    .withUsername('krantho')
    .withPassword('krantho')
    .start()
}, 120_000)

afterAll(async () => {
  await container?.stop()
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('media parity across databases', () => {
  it('should answer the same scenario identically on SQLite and Postgres', async () => {
    const sqlite = await runScenario(await startSite({ provider: 'sqlite' }))
    const postgres = await runScenario(
      await startSite({
        provider: 'postgres',
        postgres: {
          url: container.getConnectionUri(),
          maxConnections: 2,
          prepare: false,
          idleTimeoutSec: 1,
        },
      }),
    )

    expect(postgres).toEqual(sqlite)
    expect(sqlite.find((s) => s.step === 'search hit')?.body).toMatchObject({ total: 1 })
    expect(sqlite.find((s) => s.step === 'search miss')?.body).toMatchObject({ total: 0 })
    expect(sqlite.find((s) => s.step === 'get deleted')?.status).toBe(404)
    expect(sqlite.find((s) => s.step === 'delete with media')?.status).toBe(409)
    expect(sqlite.find((s) => s.step === 'delete with children')?.status).toBe(409)
    expect(sqlite.find((s) => s.step === 'register relative url')?.status).toBe(400)
    expect(sqlite.find((s) => s.step === 'capabilities')?.body).toMatchObject({
      media: 'local',
      mediaFolders: 'enabled',
    })
  }, 120_000)
})
