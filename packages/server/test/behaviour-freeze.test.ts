import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * The behaviour freeze.
 *
 * The configuration work moves where values live; it must not move what the
 * server answers. This boots a handler with nothing set in the environment and
 * pins the shape of the responses a site depends on. A change here is a change
 * in behaviour and has to be argued for, not absorbed.
 */

const FIXTURE_CONTENT = join(import.meta.dirname, 'fixtures', 'content')

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(FIXTURE_CONTENT, 'pages'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
})

const services = defineCollection({
  name: 'services',
  source: 'filesystem',
  directory: join(FIXTURE_CONTENT, 'services'),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    ingress: z.string(),
    order: z.number().optional(),
  }),
})

let handler: KranthoHandler
let dataDir: string
const savedEnv: Record<string, string | undefined> = {}

/** Clear every variable the resolver reads so the boot is a true no-env boot */
function clearKranthoEnv(): void {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function get(path: string): Promise<Response> {
  return handler.handle(new Request(`http://localhost:4002${path}`))
}

beforeAll(async () => {
  clearKranthoEnv()
  dataDir = mkdtempSync(join(tmpdir(), 'krantho-freeze-'))
  handler = await createKranthoHandler({
    config: {
      site: {
        domain: 'localhost',
        name: 'Krantho Example',
        language: 'en',
        baseUrl: 'http://localhost:4002',
        supportedLocales: ['en', 'no'],
        defaultLocale: 'en',
      },
      paths: { dataDir },
    },
    collections: { pages, services },
  })
})

afterAll(() => {
  handler.close()
  rmSync(dataDir, { recursive: true, force: true })
  restoreEnv()
})

describe('a handler booted with no environment set', () => {
  it('lists a collection', async () => {
    const res = await get('/api/content/pages')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ meta: { slug: string; status: string } }> }
    expect(body.items.map((item) => item.meta.slug).sort()).toEqual(['about', 'home'])
    // Filesystem imports land as published; the API creates drafts.
    expect(body.items.every((item) => item.meta.status === 'published')).toBe(true)
  })

  it('returns a document', async () => {
    const res = await get('/api/content/pages/home')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      meta: { collection: string; slug: string; locale: string; status: string }
      fields: Record<string, unknown>
      html: string
    }
    expect(body.meta.collection).toBe('pages')
    expect(body.meta.slug).toBe('home')
    expect(body.meta.locale).toBe('en')
    expect(body.meta.status).toBe('published')
    expect(body.fields['title']).toBe('Home')
    expect(body.html).toContain('<h2')
  })

  it('serves the sitemap with the shipped changefreq and priority', async () => {
    const res = await get('/api/seo/sitemap')
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('<loc>http://localhost:4002/</loc>')
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain('<loc>http://localhost:4002/about</loc>')
    expect(xml).toContain('<priority>0.8</priority>')
    // The home page is the homepage, listed once
    expect(xml).not.toContain('<loc>http://localhost:4002/home</loc>')
    expect(xml).toContain('<loc>http://localhost:4002/services/advisory</loc>')
    expect(xml).toContain('<priority>0.6</priority>')
  })

  it('serves robots.txt naming the sitemap at the site root', async () => {
    const res = await get('/api/seo/robots.txt')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(
      ['User-agent: *', 'Allow: /', '', 'Sitemap: http://localhost:4002/sitemap.xml'].join('\n'),
    )
  })

  it('reports the same capabilities', async () => {
    const res = await get('/api/capabilities')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      persistence: string
      authMode: string
      features: Record<string, string>
    }
    expect(body.persistence).toBe('sqlite')
    expect(body.authMode).toBe('none')
    expect(body.features).toMatchObject({
      write: 'enabled',
      versioning: 'append-only',
      media: 'disabled',
      seo: 'enabled',
      localization: 'enabled',
    })
  })

  it('reports the site configuration', async () => {
    const res = await get('/api/site-config')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { site: Record<string, unknown> }
    expect(body.site).toEqual({
      domain: 'localhost',
      name: 'Krantho Example',
      language: 'en',
      baseUrl: 'http://localhost:4002',
      sameAs: [],
      supportedLocales: ['en', 'no'],
      defaultLocale: 'en',
    })
  })

  it('reports the same auth capabilities', async () => {
    const res = await get('/api/auth/capabilities')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      auth_mode: 'none',
      login_required: false,
      capabilities: {
        password_management: false,
        role_management: false,
        self_registration: false,
        user_management: false,
        oidc_providers: [],
      },
    })
  })

  it('reports the anonymous identity', async () => {
    const res = await get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      identity: 'anonymous',
      mode: 'none',
      roles: ['admin'],
      name: 'Anonymous',
    })
  })

  it('clears both session cookies on logout', async () => {
    const res = await handler.handle(
      new Request('http://localhost:4002/api/auth/logout', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie()).toEqual([
      'krantho_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
      'krantho_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    ])
  })

  it('reports no LLM settings when nothing configured one', async () => {
    const res = await get('/api/settings/llm')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body['provider']).toBeNull()
    expect(body['configured']).toBe(false)
  })
})
