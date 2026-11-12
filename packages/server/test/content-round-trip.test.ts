import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'
import { generateManifest } from '../src/manifest.js'

/**
 * The round trip of content between the repository and production: files are imported on
 * deploy, editors change the database, `GET /api/changes` lists what differs as repository
 * files, those files are merged into the repository, and the next deploy finds nothing to
 * resolve. A repository edit after that is imported, not reported as a conflict.
 */

const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)

let site: string
let contentDir: string
let handler: KranthoHandler | undefined
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
})

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), 'krantho-round-trip-'))
  contentDir = join(site, 'content')
  mkdirSync(join(contentDir, 'pages'), { recursive: true })
})

afterEach(() => {
  handler?.close()
  handler = undefined
  rmSync(site, { recursive: true, force: true })
})

const page = (title: string, body: string): string =>
  `---\ntitle: '${title}'\ndescription: 'About ${title}'\nstatus: published\n---\n${body}`

function write(slug: string, text: string): void {
  writeFileSync(join(contentDir, 'pages', `${slug}.md`), text)
}

/** A deployment: the build's manifest, then the site starting against the same database */
async function deploy(version: number, commit: string): Promise<KranthoHandler> {
  handler?.close()
  await generateManifest(contentDir, version, commit)
  handler = await createKranthoHandler({
    config: {
      site: { domain: 'localhost', name: 'Site', language: 'en', baseUrl: 'http://localhost:4002' },
      paths: { contentDir, dataDir: join(site, 'data') },
      persistence: { provider: 'sqlite' },
    },
    collections: {
      pages: defineCollection({
        name: 'pages',
        source: 'filesystem',
        directory: join(contentDir, 'pages'),
        schema: z.object({ title: z.string(), description: z.string().optional() }),
      }),
    },
  })
  return handler
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  if (!handler) throw new Error('No deployment')
  return handler.handle(new Request(`http://localhost:4002${path}`, init))
}

interface Change {
  action: string
  slug: string
  path: string
  content: string | null
}

async function changes(): Promise<{
  commit: string | null
  changes: Change[]
  next: string | null
}> {
  const res = await call('GET', '/api/changes')
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    baseline: { commit: string | null }
    changes: Change[]
    next: string | null
  }
  return { commit: body.baseline.commit, changes: body.changes, next: body.next }
}

async function conflicts(): Promise<number> {
  const body = (await (await call('GET', '/api/migrations/status')).json()) as {
    unresolvedConflicts: number
  }
  return body.unresolvedConflicts
}

/** An editor saves and publishes a page in Studio */
async function edit(slug: string, fields: Record<string, string>, body?: string): Promise<void> {
  const saved = await call('PUT', `/api/content/pages/${slug}`, { fields, body })
  expect(saved.status).toBe(200)
  const published = await call('POST', `/api/content/pages/${slug}/publish`, {
    status: 'published',
  })
  expect(published.status).toBe(200)
}

describe('content round trip', () => {
  it('lists nothing while production holds what the repository has, and names the baseline commit', async () => {
    write('about', page('About', 'About us\n'))
    write('home', page('Home', 'Welcome\n'))
    await deploy(100, COMMIT_A)

    const result = await changes()
    expect(result.commit).toBe(COMMIT_A)
    expect(result.changes).toEqual([])
    expect(result.next).toBeNull()
  })

  it('lists an edit, a new page and a deletion as repository files, and merging them closes the loop', async () => {
    write('about', page('About', 'About us\n'))
    write('home', page('Home', 'Welcome\n'))
    await deploy(100, COMMIT_A)

    await edit(
      'about',
      { title: 'About', description: 'Rewritten in Studio' },
      'About us, rewritten\n',
    )
    const created = await call('POST', '/api/content/pages', {
      slug: 'team',
      fields: { title: 'Team' },
      body: 'The team\n',
    })
    expect(created.status).toBe(201)
    await call('POST', '/api/content/pages/team/publish', { status: 'published' })
    expect((await call('DELETE', '/api/content/pages/home')).status).toBe(200)

    const result = await changes()
    expect(result.changes.map((c) => [c.action, c.path]).sort()).toEqual([
      ['add', 'pages/team.md'],
      ['delete', 'pages/home.md'],
      ['edit', 'pages/about.md'],
    ])
    const about = result.changes.find((c) => c.slug === 'about')
    expect(about?.content).toBe(
      '---\ntitle: About\ndescription: Rewritten in Studio\nstatus: published\n---\nAbout us, rewritten\n',
    )

    // The developer merges the pull: files written, the deleted file removed, the next deploy
    for (const change of result.changes) {
      if (change.action === 'delete') rmSync(join(contentDir, change.path))
      else writeFileSync(join(contentDir, change.path), change.content ?? '')
    }
    await deploy(200, COMMIT_B)

    expect(await conflicts()).toBe(0)
    expect((await changes()).changes).toEqual([])
    expect((await changes()).commit).toBe(COMMIT_B)
  })

  it('imports a repository edit made after a pull was merged, without a conflict', async () => {
    write('about', page('About', 'About us\n'))
    await deploy(100, COMMIT_A)
    await edit('about', { title: 'About', description: 'Rewritten in Studio' }, 'Pulled\n')
    const pulled = (await changes()).changes[0]
    writeFileSync(join(contentDir, pulled?.path ?? ''), pulled?.content ?? '')
    await deploy(200, COMMIT_B)

    write('about', page('About', 'A developer rewrote it\n'))
    await deploy(300, COMMIT_B)

    expect(await conflicts()).toBe(0)
    const res = await call('GET', '/api/content/pages/about')
    expect(((await res.json()) as { body: string }).body).toBe('A developer rewrote it\n')
  })

  it("keeps an editor's newer version when the developer changed the same page, and reports a conflict", async () => {
    write('about', page('About', 'About us\n'))
    await deploy(100, COMMIT_A)
    await edit('about', { title: 'About' }, 'Edited in Studio\n')
    write('about', page('About', 'Edited by a developer\n'))
    await deploy(200, COMMIT_B)

    expect(await conflicts()).toBe(1)
    const res = await call('GET', '/api/content/pages/about')
    expect(((await res.json()) as { body: string }).body).toBe('Edited in Studio\n')
    // Production still differs from the repository, so a pull still lists it
    expect((await changes()).changes.map((c) => c.slug)).toEqual(['about'])
  })

  it('writes files the next import reads back as the same documents', async () => {
    write('about', page('About', 'About us\n'))
    await deploy(100, COMMIT_A)
    await edit('about', { title: 'It: "complicated"', description: 'no' }, 'Line one\n\nLine two\n')
    const file = (await changes()).changes[0]?.content ?? ''
    write('about', file)

    expect(readFileSync(join(contentDir, 'pages', 'about.md'), 'utf-8')).toBe(file)
    await deploy(200, COMMIT_B)
    expect(await conflicts()).toBe(0)
    expect((await changes()).changes).toEqual([])
  })
  it('never reads out the text of a page an editor unpublished', async () => {
    write('about', page('About', 'About us\n'))
    await deploy(100, COMMIT_A)
    expect(
      (
        await call('PUT', '/api/content/pages/about', {
          fields: { title: 'About' },
          body: 'A secret draft\n',
        })
      ).status,
    ).toBe(200)
    expect(
      (await call('POST', '/api/content/pages/about/publish', { status: 'draft' })).status,
    ).toBe(200)

    const result = await changes()
    expect(JSON.stringify(result)).not.toContain('secret draft')
    expect(result.changes).toEqual([])
  })

  it('lists a long change set page by page', async () => {
    for (const slug of ['a', 'b', 'c']) write(slug, page(slug, `${slug}\n`))
    await deploy(100, COMMIT_A)
    for (const slug of ['a', 'b', 'c']) await edit(slug, { title: slug }, `${slug} edited\n`)

    const first = (await (await call('GET', '/api/changes?limit=2')).json()) as {
      changes: Change[]
      next: string | null
    }
    expect(first.changes).toHaveLength(2)
    expect(first.next).not.toBeNull()
    const second = (await (
      await call('GET', `/api/changes?limit=2&cursor=${first.next}`)
    ).json()) as { changes: Change[]; next: string | null }
    expect(second.changes).toHaveLength(1)
    expect(second.next).toBeNull()
    expect([...first.changes, ...second.changes].map((c) => c.slug).sort()).toEqual(['a', 'b', 'c'])
  })
})
