import { describe, expect, it } from 'vitest'
import { validateDocumentSeo } from '../src/seo-validation.js'
import { editor } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

describe('validateDocumentSeo', () => {
  it('reports a missing title and meta description as errors', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'notes', slug: 'bare', fields: { title: '', category: 'x' } },
      'draft',
    )
    const findings = await validateDocumentSeo(testContext(editor, stores), 'notes', 'bare', 'en')

    expect(findings).toContainEqual(expect.objectContaining({ severity: 'error', check: 'title' }))
    expect(findings).toContainEqual(
      expect.objectContaining({ severity: 'error', check: 'meta-description' }),
    )
  })

  it('warns about a long title and a description outside the configured length', async () => {
    const stores = testStores()
    const title = 'A'.repeat(80)
    await stores.adapter.seed(
      { collection: 'pages', slug: 'long', fields: { title, description: 'Too short.' } },
      'draft',
    )
    const findings = await validateDocumentSeo(testContext(editor, stores), 'pages', 'long', 'en')

    expect(findings).toContainEqual(
      expect.objectContaining({ severity: 'warning', check: 'title' }),
    )
    const meta = findings.find((finding) => finding.check === 'meta-description')
    expect(meta).toMatchObject({ severity: 'warning' })
    expect(meta?.message).toContain('120–155')
  })

  it("checks the structured data against each reader's rules, naming the reader and its source", async () => {
    const stores = testStores()
    await stores.seo.saveConfig({
      id: 'collection:pages',
      scope: 'collection',
      config: { entities: [{ '@type': 'Product', properties: {} }] },
    })
    await stores.adapter.seed(
      { collection: 'pages', slug: 'widget', fields: { title: 'Widget' } },
      'draft',
    )
    const findings = await validateDocumentSeo(testContext(editor, stores), 'pages', 'widget', 'en')

    const structured = findings.filter((finding) => finding.check === 'structured-data')
    const offers = structured.find((f) => f.type === 'Product' && f.code === 'profile-required')
    expect(offers).toMatchObject({ severity: 'warning', reader: 'google' })
    expect(offers?.message).toContain('"offers"')
    expect(offers?.source).toMatch(/^https:\/\//)
    expect(structured.some((f) => f.severity === 'error')).toBe(false)
  })

  it('throws for a document that does not exist', async () => {
    await expect(
      validateDocumentSeo(testContext(editor, testStores()), 'pages', 'nope', 'en'),
    ).rejects.toThrow('not found')
  })
})
