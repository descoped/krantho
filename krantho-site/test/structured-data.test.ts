import { validateGraph } from '@krantho/seo'
import { describe, expect, it } from 'vitest'
import {
  checkPageSource,
  checkSite,
  extractJsonLd,
  formatReport,
  sitemapPaths,
} from '../scripts/structured-data.mjs'

const validate = (graph: Record<string, unknown>) =>
  validateGraph(graph, { profiles: ['google', 'bing'] })

const ARTICLE = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://example.com/#site', name: 'Example' },
    {
      '@type': 'Article',
      '@id': 'https://example.com/post#article',
      headline: 'A post',
      isPartOf: { '@id': 'https://example.com/#site' },
    },
  ],
}

/** A graph that is not Schema.org: the type does not exist */
const BROKEN = { '@context': 'https://schema.org', '@type': 'Artikkel', name: 'Not a type' }

/** A page's source as the site emits it: serializeJsonLd escapes `<` */
function page(...blocks: string[]): string {
  const scripts = blocks.map((json) => `<script type="application/ld+json">${json}</script>`)
  return `<!DOCTYPE html><html><head><title>Page</title>${scripts.join('')}</head><body></body></html>`
}

const json = (value: object): string => JSON.stringify(value).replace(/</g, '\\u003c')

const SITEMAP = `<?xml version="1.0"?><urlset>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/post?a=1&amp;b=2</loc></url>
</urlset>`

const errorsOf = (findings: readonly { severity: string }[]) =>
  findings.filter((finding) => finding.severity === 'error')

describe('sitemapPaths', () => {
  it('lists each page as a path, so any site can be checked, entities decoded', () => {
    expect(sitemapPaths(SITEMAP)).toEqual(['/', '/post?a=1&b=2'])
  })
})

describe('extractJsonLd', () => {
  it('parses every JSON-LD block of the source and ignores other scripts', () => {
    const html = `${page(json(ARTICLE), json(BROKEN))}<script>var a = 1</script>`
    expect(extractJsonLd(html)).toEqual([{ graph: ARTICLE }, { graph: BROKEN }])
  })

  it('reads an escaped `<` as the character', () => {
    const [block] = extractJsonLd(page(json({ '@type': 'Thing', name: '<b>' })))
    expect(block).toEqual({ graph: { '@type': 'Thing', name: '<b>' } })
  })

  it('says when a block is not JSON', () => {
    const [block] = extractJsonLd(page('{ not json'))
    expect(block?.invalid).toEqual(expect.any(String))
  })
})

describe('checkPageSource', () => {
  it('has no errors for a valid graph', () => {
    const result = checkPageSource(page(json(ARTICLE)), validate)
    expect(result.blocks).toBe(1)
    expect(result.problems).toEqual([])
    expect(errorsOf(result.findings)).toEqual([])
  })

  it('reports the errors a graph has against Schema.org', () => {
    const result = checkPageSource(page(json(BROKEN)), validate)
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'unknown-type', profile: 'schema.org' }),
    )
  })

  it('warns about a page with no structured data, and errors on a block that is not JSON', () => {
    expect(checkPageSource(page(), validate).problems).toEqual([
      { severity: 'warning', message: 'The page carries no structured data.' },
    ])
    expect(checkPageSource(page('{'), validate).problems[0]).toMatchObject({ severity: 'error' })
  })
})

type Served = Record<string, { status?: number; html?: string }>

/** A fetch answering with what the site serves, by path */
function site(pages: Served) {
  return async (input: string | URL | Request): Promise<Response> => {
    const { pathname, search } = new URL(input instanceof Request ? input.url : input.toString())
    if (pathname === '/sitemap.xml') return new Response(SITEMAP)
    const served = pages[`${pathname}${search}`]
    if (!served) return new Response('', { status: 404 })
    return new Response(served.html ?? '', { status: served.status ?? 200 })
  }
}

describe('checkSite', () => {
  it('checks every sitemap page on the site it is given and counts errors and warnings', async () => {
    const result = await checkSite({
      baseUrl: 'http://localhost:3000',
      validate,
      fetcher: site({
        '/': { html: page(json(ARTICLE)) },
        '/post?a=1&b=2': { html: page(json(BROKEN)) },
      }),
    })
    expect(result.pages.map((checked) => checked.path)).toEqual(['/', '/post?a=1&b=2'])
    expect(result.errors).toBeGreaterThan(0)
    expect(errorsOf(result.pages[0]?.findings ?? [])).toEqual([])
    expect(errorsOf(result.pages[1]?.findings ?? [])).not.toEqual([])
    expect(formatReport(result)).toContain('/post?a=1&b=2\n  schema.org\n    [error]')
  })

  it('counts a page that does not answer 200 as an error', async () => {
    const result = await checkSite({
      baseUrl: 'https://example.com',
      validate,
      fetcher: site({ '/': { html: page(json(ARTICLE)) }, '/post?a=1&b=2': { status: 500 } }),
    })
    expect(result.pages[1]?.problems).toEqual([
      { severity: 'error', message: 'The page answered HTTP 500.' },
    ])
    expect(result.errors).toBeGreaterThan(0)
  })

  it('has no errors, and reports warnings, when every page is valid', async () => {
    const result = await checkSite({
      baseUrl: 'https://example.com',
      validate,
      fetcher: site({ '/': { html: page(json(ARTICLE)) }, '/post?a=1&b=2': { html: page() } }),
    })
    expect(result.errors).toBe(0)
    expect(result.warnings).toBeGreaterThan(0)
    expect(formatReport(result)).toContain('The page carries no structured data.')
  })

  it('fails when the sitemap cannot be read or lists no pages', async () => {
    const baseUrl = 'https://example.com'
    const missing = async () => new Response('', { status: 404 })
    await expect(checkSite({ baseUrl, validate, fetcher: missing })).rejects.toThrow(
      'sitemap.xml answered HTTP 404',
    )
    const empty = async () => new Response('<urlset></urlset>')
    await expect(checkSite({ baseUrl, validate, fetcher: empty })).rejects.toThrow(
      'sitemap.xml lists no pages',
    )
  })
})
