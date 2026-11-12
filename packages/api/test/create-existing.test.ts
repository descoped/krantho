import { describe, expect, it } from 'vitest'
import { type SaveDocumentInput, saveDocument } from '../src/save-document.js'
import { editor } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'

function create(slug: string, locale?: string): SaveDocumentInput {
  return {
    collection: 'pages',
    slug,
    fields: { title: `Page ${slug}` },
    body: '',
    locale,
    isNew: true,
    changedBy: 'editor:e@example.test',
  }
}

describe('a create never writes over an existing document', () => {
  it('refuses with 409 a second create of the same slug and locale, writing nothing', async () => {
    const ctx = testContext(editor, testStores())
    expect((await saveDocument(ctx, create('a', 'en'))).ok).toBe(true)
    const again = await saveDocument(ctx, create('a', 'en'))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.response.status).toBe(409)
    expect((await ctx.adapter.getContent?.('pages', 'a', 'en'))?.meta.version).toBe(1)
  })

  it('creates the same slug in another locale', async () => {
    const ctx = testContext(editor, testStores())
    expect((await saveDocument(ctx, create('a', 'en'))).ok).toBe(true)
    expect((await saveDocument(ctx, create('a', 'nb'))).ok).toBe(true)
  })

  it('checks the slug the before-save hook settles on, not the one sent', async () => {
    const ctx = testContext(editor, testStores())
    expect((await saveDocument(ctx, create('a', 'en'))).ok).toBe(true)
    const renaming = {
      ...ctx,
      contentHooks: { beforeSave: async (doc: { slug: string }) => ({ ...doc, slug: 'a' }) },
    }
    const renamed = await saveDocument(renaming, create('b', 'en'))
    expect(renamed.ok).toBe(false)
    if (!renamed.ok) expect(renamed.response.status).toBe(409)
  })
})
