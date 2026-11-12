import { describe, expect, it } from 'vitest'
import { createApiHandlers } from '../src/create-api-handlers.js'
import { buildLlmsTxt, LLMS_TXT_SETTING } from '../src/handlers/seo-llms-txt.js'
import { editor } from './assistant/auth.js'
import {
  contentConfig,
  testConfig,
  testContext,
  testEngine,
  testStores,
} from './assistant/fixtures.js'

async function seedSite(stores: ReturnType<typeof testStores>): Promise<void> {
  const { adapter } = stores
  await adapter.seed(
    {
      collection: 'pages',
      slug: 'about',
      fields: { title: 'About us', description: 'Who we are.' },
    },
    'published',
  )
  await adapter.seed(
    { collection: 'pages', slug: 'draft-only', fields: { title: 'Draft' } },
    'draft',
  )
  await adapter.seed(
    { collection: 'pages', slug: 'hidden', fields: { title: 'Hidden', 'robots-index': false } },
    'published',
  )
  await adapter.seed(
    { collection: 'articles', slug: 'hello', fields: { title: 'Hello\nworld' } },
    'published',
  )
  // A newer draft over a live document: the live version is what is listed
  await adapter.seed(
    { collection: 'articles', slug: 'hello', fields: { title: 'Changed draft' } },
    'draft',
  )
  await stores.seo.saveConfig({
    id: 'site',
    scope: 'site',
    config: {
      entities: [{ '@type': 'Organization', properties: { description: 'An example site.' } }],
    },
  })
}

describe('buildLlmsTxt', () => {
  it('lists the live, indexable documents per collection under the site name and summary', async () => {
    const stores = testStores()
    await seedSite(stores)
    const text = await buildLlmsTxt(testContext(editor, stores))

    expect(text).toBe(
      [
        '# Example Site',
        '',
        '> An example site.',
        '',
        '## pages',
        '',
        '- [About us](https://example.com/about): Who we are.',
        '',
        '## articles',
        '',
        '- [Hello world](https://example.com/articles/hello)',
        '',
      ].join('\n'),
    )
  })

  it('uses the summary and link descriptions it is given', async () => {
    const stores = testStores()
    await seedSite(stores)
    const text = await buildLlmsTxt(testContext(editor, stores), {
      summary: 'A better summary.',
      descriptions: new Map([['articles/hello', 'A first post.']]),
    })

    expect(text).toContain('> A better summary.')
    expect(text).toContain('- [Hello world](https://example.com/articles/hello): A first post.')
  })
})

describe('GET /api/seo/llms.txt', () => {
  it('serves the generated text until a snapshot is saved, then the snapshot, naming which', async () => {
    const stores = testStores()
    await seedSite(stores)
    const api = createApiHandlers({
      contentConfig,
      config: testConfig({ assistant: { enabled: false } }),
      adapter: stores.adapter,
      engine: testEngine(),
      siteSettingsAdapter: stores.settings,
      seoConfigAdapter: stores.seo,
    })
    const get = () =>
      api.handle({ method: 'GET', path: '/api/seo/llms.txt', params: {}, query: {} })

    const generated = await get()
    expect(generated.status).toBe(200)
    expect(generated.headers?.['content-type']).toBe('text/plain; charset=utf-8')
    expect(generated.body).toContain('# Example Site')
    expect(generated.headers?.['x-krantho-llms-origin']).toBe('generated')

    await stores.settings.setSetting(LLMS_TXT_SETTING, '# Saved\n')
    const saved = await get()
    expect(saved.body).toBe('# Saved\n')
    expect(saved.headers?.['x-krantho-llms-origin']).toBe('snapshot')
  })
})
