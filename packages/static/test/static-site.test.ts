import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, KranthoConfigError, LEAVES } from '@krantho/config'
import { defineCollection, defineDocumentArchetype } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { basePathOf } from '../src/base-path.js'
import { createStaticSite } from '../src/static-site.js'

let root: string
const savedEnv: Record<string, string | undefined> = {}

function git(args: string[], date?: string): void {
  const env = date
    ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : process.env
  execFileSync('git', args, { cwd: root, env, stdio: 'ignore' })
}

function write(file: string, text: string): void {
  const path = join(root, 'content', file)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

function docsIn(directory: string, path: string | false = '/docs/:slug/', name = 'docs') {
  return defineCollection({
    name,
    source: 'filesystem',
    path,
    directory,
    archetype: defineDocumentArchetype({
      id: 'test/docs',
      label: 'Docs',
      fields: z.object({ title: z.string(), description: z.string() }),
    }),
  })
}

function siteConfig(baseUrl: string): KranthoConfigInput {
  return {
    site: { domain: 'example.github.io', name: 'Static docs', language: 'en', baseUrl },
    paths: { contentDir: join(root, 'content') },
    persistence: { provider: 'filesystem' },
    cache: { pages: 'none' },
    seo: { identity: 'WebSite', collections: { docs: ['TechArticle'] } },
  }
}

beforeEach(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  root = mkdtempSync(join(tmpdir(), 'krantho-static-'))
  write(
    'docs/intro.md',
    '---\ntitle: Intro\ndescription: Start here\n---\nSee [setup](/docs/setup/).',
  )
  write('docs/setup.md', '---\ntitle: Setup\ndescription: Install it\n---\nRun it.')
  write('docs/later.md', '---\ntitle: Later\ndescription: Not yet\nstatus: draft\n---\nSoon.')
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('basePathOf', () => {
  it('is the path of the site address, without a trailing slash', () => {
    expect(basePathOf('https://owner.github.io/docs-site')).toBe('/docs-site')
    expect(basePathOf('https://owner.github.io/docs-site/')).toBe('/docs-site')
    expect(basePathOf('https://docs.example.com')).toBe('')
    expect(basePathOf('https://docs.example.com/')).toBe('')
  })

  it('refuses an address that is not an absolute URL', () => {
    expect(() => basePathOf('/docs-site')).toThrow('site.baseUrl is not an absolute URL')
  })
})

describe('createStaticSite', () => {
  it('refuses a configuration with a database or a page cache', () => {
    const docs = docsIn(join(root, 'content', 'docs'))
    const config: KranthoConfigInput = {
      ...siteConfig('https://example.github.io/site'),
      persistence: { provider: 'sqlite' },
      cache: { pages: 'next-isr' },
    }

    const create = () => createStaticSite({ config, collections: { docs } })

    expect(create).toThrow(KranthoConfigError)
    expect(create).toThrow(/persistence.provider is sqlite/)
    expect(create).toThrow(/cache.pages is next-isr/)
  })

  it('refuses a collection with pages whose path does not end in a slash', () => {
    const docs = docsIn(join(root, 'content', 'docs'), '/docs/:slug')
    const globals = docsIn(join(root, 'content', 'globals'), false, 'globals')

    const create = () =>
      createStaticSite({
        config: siteConfig('https://example.github.io/site'),
        collections: { docs, globals },
      })

    expect(create).toThrow('collection docs has path /docs/:slug')
    expect(create).not.toThrow(/collection globals/)
  })

  it('lists one page for each published document', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = docsIn(join(root, 'content', 'docs'))
    const site = createStaticSite({
      config: siteConfig('https://example.github.io/site'),
      collections: { docs },
    })

    const params = await site.params('docs')

    expect(params.map((page) => page.slug).sort()).toEqual(['intro', 'setup'])
    await expect(site.params('blog')).rejects.toThrow('No collection named blog')
  })

  it('serves the site under the path of its address', () => {
    const docs = docsIn(join(root, 'content', 'docs'))
    const underPath = createStaticSite({
      config: siteConfig('https://example.github.io/site'),
      collections: { docs },
    })
    const atRoot = createStaticSite({
      config: siteConfig('https://docs.example.com'),
      collections: { docs },
    })

    expect(underPath.basePath).toBe('/site')
    expect(atRoot.basePath).toBe('')
    expect(atRoot.robotsTxt()).toContain('Sitemap: https://docs.example.com/sitemap.xml')
  })

  it('writes the sitemap and llms.txt from the published pages, dated by their last commit', async () => {
    git(['init', '-q', '-b', 'main'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'Test'])
    git(['config', 'commit.gpgsign', 'false'])
    git(['add', '.'])
    git(['commit', '-q', '-m', 'docs'], '2025-04-05T06:07:08Z')
    const docs = docsIn(join(root, 'content', 'docs'))
    const site = createStaticSite({
      config: siteConfig('https://example.github.io/site'),
      collections: { docs },
    })

    const sitemap = await site.sitemapXml()
    const llms = await site.llmsTxt()

    expect(sitemap).toContain('<loc>https://example.github.io/site/docs/intro/</loc>')
    expect(sitemap).toContain('<lastmod>2025-04-05T06:07:08.000Z</lastmod>')
    expect(sitemap).not.toContain('later')
    expect(llms).toContain('# Static docs')
    expect(llms).toContain('- [Setup](https://example.github.io/site/docs/setup/): Install it')
  })

  it('composes each page’s JSON-LD from the configured SEO', async () => {
    const docs = docsIn(join(root, 'content', 'docs'))
    const site = createStaticSite({
      config: siteConfig('https://example.github.io/site'),
      collections: { docs },
    })

    const graph = (await site.loader.jsonLd({ collection: 'docs', slug: 'intro' })) as {
      '@graph': Array<Record<string, unknown>>
    }
    const types = graph['@graph'].map((node) => node['@type'])

    expect(types).toContain('WebSite')
    expect(types).toContain('TechArticle')
  })

  it('warns that pages are dated by modification time without git history', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = docsIn(join(root, 'content', 'docs'))
    const site = createStaticSite({
      config: siteConfig('https://example.github.io/site'),
      collections: { docs },
    })

    await site.params('docs')
    await site.sitemapXml()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('fetch-depth: 0')
  })
})
