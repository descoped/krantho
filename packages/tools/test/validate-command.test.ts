import { resolveConfig } from '@krantho/config'
import type { ContentDocument } from '@krantho/persistence'
import { registerProfile } from '@krantho/seo'
import type { SeoConfigData } from '@krantho/seo-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewOf } from '../src/seo/preview-command'
import { validateConfig, validateDocuments } from '../src/seo/validate-command'

const site = {
  domain: 'example.org',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.org',
}

function document(
  collection: string,
  slug: string,
  fields: Record<string, unknown>,
): ContentDocument {
  return {
    meta: {
      collection,
      slug,
      locale: 'en',
      version: 1,
      liveVersion: 1,
      status: 'published',
      source: 'api',
      changedBy: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    fields,
    metadata: {},
    contract: null,
    defaults: [],
    repositoryBasis: null,
    body: '',
    html: '',
    sections: {},
  }
}

function stored(configs: Record<string, SeoConfigData>) {
  return { getConfig: async (id: string) => (configs[id] ? { config: configs[id] } : null) }
}

function published(docs: ContentDocument[]) {
  return {
    collections: () => [...new Set(docs.map((doc) => doc.meta.collection))],
    documents: async (collection: string) =>
      docs.filter((doc) => doc.meta.collection === collection),
  }
}

describe('seo validate', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    vi.restoreAllMocks()
  })

  it('reports a configuration a reader cannot use as errors', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    restore = registerProfile({
      id: 'strict',
      name: 'Strict',
      rules: [
        {
          type: 'Organization',
          status: 'active',
          required: ['logo'],
          source: 'https://example.org/rules',
          verifiedAt: '2026-10-02',
        },
      ],
    })
    const config = resolveConfig({ site, seo: { identity: 'Organization', readers: ['strict'] } })

    const { seo, errors } = await validateConfig(config)
    expect(seo).toBeNull()
    expect(errors).toBe(1)
  })

  it("counts the errors in every published page's graph, and only the errors", async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { seo } = await validateConfig(resolveConfig({ site }))
    if (!seo) throw new Error('expected the subsystem')

    const configs = stored({
      'collection:events': { entities: [{ '@type': 'Event', properties: {} }] },
      'collection:pages': {
        entities: [{ '@type': 'Article', properties: { 'query-input': 'required name=q' } }],
      },
    })
    const docs = [
      document('events', 'talk', { title: 'Talk' }),
      document('pages', 'about', { title: 'About' }),
      document('globals', 'footer', { title: 'Footer' }),
    ]
    const errors = await validateDocuments(seo, configs, published(docs))

    expect(errors).toBe(1)
    const output = log.mock.calls.map(([line]) => String(line)).join('\n')
    expect(output).toContain('events/talk (/events/talk)')
    expect(output).toContain('Property "query-input" is not in the Schema.org vocabulary.')
    expect(output).toContain('startDate')
    expect(output).not.toContain('globals/footer')
  })
})

describe("the site's robots.txt override", () => {
  const OVERRIDE = 'User-agent: *\nDisallow: /private/'
  const configs = stored({
    site: {
      entities: [{ '@type': 'Organization', properties: { name: 'Example' } }],
      robotsTxt: OVERRIDE,
    },
    'collection:pages': { entities: [{ '@type': 'Article', properties: {} }] },
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is in no graph seo validate checks', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { seo } = await validateConfig(resolveConfig({ site }))
    if (!seo) throw new Error('expected the subsystem')
    const graphs: unknown[] = []
    const validate = seo.validate.bind(seo)
    vi.spyOn(seo, 'validate').mockImplementation((graph) => {
      graphs.push(graph)
      return validate(graph)
    })
    await validateDocuments(
      seo,
      configs,
      published([document('pages', 'about', { title: 'About' })]),
    )
    expect(graphs).toHaveLength(1)
    expect(JSON.stringify(graphs)).toContain('Example')
    expect(JSON.stringify(graphs)).not.toContain('Disallow')
    expect(log.mock.calls.join('\n')).not.toContain('robots')
  })

  it('is in no graph seo preview prints', async () => {
    const preview = await previewOf(configs, 'pages', 'about')
    expect(preview.effectiveTypes).toEqual(['Article'])
    expect(JSON.stringify(preview.composed)).toContain('Example')
    expect(JSON.stringify(preview)).not.toContain('Disallow')
  })
})
