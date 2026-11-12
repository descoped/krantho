import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { jsonLdTags } from '@krantho/core'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ContentLoader } from '../src/content-loader.js'
import { createContentLoader } from '../src/content-loader.js'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'
import { runPageRequest } from '../src/page-request.js'

/**
 * A page renders inside `runPageRequest()`: every content loader read records
 * its cache tags into the request, and a preview request reads drafts. Outside
 * a request the loader behaves as it always has.
 */

const fixtures = fileURLToPath(new URL('./fixtures/content', import.meta.url))

const site = {
  domain: 'localhost',
  name: 'Page request',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: join(fixtures, 'pages'),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

const home = { collection: 'pages', slug: 'home' }

let dataDir: string
let handler: KranthoHandler
let loader: ContentLoader
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
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-page-request-')), 'data')
  const config: KranthoConfigInput = { site, paths: { dataDir } }
  handler = await createKranthoHandler({ config, collections })
  loader = createContentLoader({ config, collections })
})

afterEach(() => {
  handler.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
})

/** Save a draft of the home page over its published version */
async function saveHomeDraft(): Promise<void> {
  const saved = await handler.handle(
    new Request('http://localhost/api/content/pages/home', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fields: { title: 'Draft home', description: 'A draft' },
        body: 'Draft',
      }),
    }),
  )
  expect(saved.status).toBe(200)
}

describe('runPageRequest tags', () => {
  it('records the tags of a document read', async () => {
    const { value, tags } = await runPageRequest({ preview: false }, () =>
      loader.getPublished(home),
    )
    expect(value?.fields['title']).toBe('Home')
    expect(tags).toEqual(['k:site', 'k:d:pages:home'])
  })

  it('records the tags of a list read', async () => {
    const { value, tags } = await runPageRequest({ preview: false }, () =>
      loader.listPublished('pages'),
    )
    expect(value.length).toBeGreaterThan(0)
    expect(tags).toEqual(['k:site', 'k:c:pages'])
  })

  it('records the tags of a summaries read', async () => {
    const { value, tags } = await runPageRequest({ preview: false }, () =>
      loader.listPublishedSummaries('pages'),
    )
    expect(value.length).toBeGreaterThan(0)
    expect(tags).toEqual(['k:site', 'k:c:pages'])
  })

  it('records the tags of a JSON-LD read', async () => {
    const { tags } = await runPageRequest({ preview: false }, () => loader.jsonLd(home))
    expect(tags).toEqual(jsonLdTags('pages', 'home'))
    expect(tags).toContain('k:d:pages:home')
  })

  it('records the tags of an SEO properties read', async () => {
    const { tags } = await runPageRequest({ preview: false }, () => loader.seoProperties('site'))
    expect(tags).toEqual(['k:site', 'k:seo', 'k:seo:site'])
  })

  it('deduplicates tags in first-read order, cache hits included', async () => {
    const { tags } = await runPageRequest({ preview: false }, async () => {
      await loader.getPublished(home)
      await loader.listPublished('pages')
      await loader.getPublished(home)
      await loader.getPublished({ collection: 'pages', slug: 'about' })
    })
    expect(tags).toEqual(['k:site', 'k:d:pages:home', 'k:c:pages', 'k:d:pages:about'])
  })

  it('tags a read that finds nothing, so publishing it later invalidates the page', async () => {
    const { value, tags } = await runPageRequest({ preview: false }, () =>
      loader.getPublished({ collection: 'pages', slug: 'missing' }),
    )
    expect(value).toBeNull()
    expect(tags).toEqual(['k:site', 'k:d:pages:missing'])
  })

  it('keeps concurrent and nested requests apart', async () => {
    const [about, list] = await Promise.all([
      runPageRequest({ preview: false }, () =>
        loader.getPublished({ collection: 'pages', slug: 'about' }),
      ),
      runPageRequest({ preview: false }, () => loader.listPublished('pages')),
    ])
    expect(about.tags).toEqual(['k:site', 'k:d:pages:about'])
    expect(list.tags).toEqual(['k:site', 'k:c:pages'])

    const outer = await runPageRequest({ preview: false }, async () => {
      const inner = await runPageRequest({ preview: false }, () => loader.listPublished('pages'))
      await loader.getPublished(home)
      return inner.tags
    })
    expect(outer.value).toEqual(['k:site', 'k:c:pages'])
    expect(outer.tags).toEqual(['k:site', 'k:d:pages:home'])
  })
})

describe('runPageRequest preview', () => {
  it('serves the draft to a preview request and the published version otherwise', async () => {
    await saveHomeDraft()

    const preview = await runPageRequest({ preview: true }, async () => ({
      doc: await loader.getPublished(home),
      jsonLd: JSON.stringify(await loader.jsonLd(home)),
    }))
    expect(preview.value.doc?.fields['title']).toBe('Draft home')
    expect(preview.value.jsonLd).toContain('Draft home')
    expect(preview.tags).toEqual(jsonLdTags('pages', 'home'))

    const published = await runPageRequest({ preview: false }, () => loader.getPublished(home))
    expect(published.value?.fields['title']).toBe('Home')
  })

  it('lists the live version of each summary to a preview request too, read uncached', async () => {
    await saveHomeDraft()
    const titles = (docs: Array<{ slug: string; fields: Record<string, unknown> }>) =>
      docs.find((doc) => doc.slug === 'home')?.fields['title']

    const preview = await runPageRequest({ preview: true }, () =>
      loader.listPublishedSummaries('pages'),
    )
    const published = await runPageRequest({ preview: false }, () =>
      loader.listPublishedSummaries('pages'),
    )

    expect(titles(preview.value)).toBe('Home')
    expect(titles(published.value)).toBe('Home')
    expect(preview.tags).toEqual(['k:site', 'k:c:pages'])
    expect(preview.value.every((doc) => !('body' in doc))).toBe(true)
  })

  it('tells a render whether it is a preview: only inside a preview request, or on the preview view', async () => {
    expect((await runPageRequest({ preview: true }, () => loader.isPreview())).value).toBe(true)
    expect((await runPageRequest({ preview: false }, () => loader.isPreview())).value).toBe(false)
    expect(await loader.isPreview()).toBe(false)
    expect(await loader.preview.isPreview()).toBe(true)
  })

  it('keeps a concurrent published request on the published version', async () => {
    await saveHomeDraft()

    const [preview, published] = await Promise.all([
      runPageRequest({ preview: true }, () => loader.getPublished(home)),
      runPageRequest({ preview: false }, () => loader.getPublished(home)),
    ])
    expect(preview.value?.fields['title']).toBe('Draft home')
    expect(published.value?.fields['title']).toBe('Home')
  })
})

describe('outside a page request', () => {
  it('reads the published version and records nothing', async () => {
    await saveHomeDraft()

    expect((await loader.getPublished(home))?.fields['title']).toBe('Home')
    expect((await loader.preview.getPublished(home))?.fields['title']).toBe('Draft home')

    // A later request starts with no tags from reads made outside it
    const { tags } = await runPageRequest({ preview: false }, async () => 'rendered')
    expect(tags).toEqual([])
  })
})
