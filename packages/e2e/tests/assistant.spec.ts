import type { Page } from '@playwright/test'
import { type FakeModel, type ScriptStep, startFakeModel } from '../src/fake-model.js'
import { createDocument, expect, pageDocument, type Target, test } from '../src/fixtures.js'

// The assistant on every stack, end to end: Studio's panel, the chat API, the tools and the
// confirmation of a proposal, against a model that answers from a script (`src/fake-model.ts`)
// through the `ollama` provider, which needs no credential. The site's AI provider is put back
// when a test is done.

interface Item {
  meta: { version: number; liveVersion: number | null }
  fields: Record<string, unknown>
}

async function readDocument(target: Target, slug: string): Promise<Item> {
  const { collection } = target.site.pages
  const res = await fetch(new URL(`/api/content/${collection}/${slug}`, target.baseURL))
  if (!res.ok) throw new Error(`GET ${collection}/${slug} failed with ${res.status}`)
  return (await res.json()) as Item
}

async function setProvider(target: Target, baseUrl: string): Promise<void> {
  const res = await fetch(new URL('/api/settings/llm', target.baseURL), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'ollama', baseUrl, model: 'e2e-model', use: true }),
  })
  if (!res.ok) throw new Error(`PUT /api/settings/llm failed with ${res.status}`)
}

/** Run `body` with the site's AI provider pointed at a scripted model, then put it back */
async function withModel(
  target: Target,
  script: ScriptStep[],
  body: (model: FakeModel) => Promise<void>,
): Promise<void> {
  const model = await startFakeModel(script)
  try {
    await setProvider(target, model.baseUrl)
    await body(model)
  } finally {
    await fetch(new URL('/api/settings/llm?provider=ollama', target.baseURL), { method: 'DELETE' })
    await model.stop()
  }
}

async function openAssistant(page: Page): Promise<void> {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Assistant' }).click()
  await expect(page.getByRole('complementary', { name: 'Assistant' })).toBeVisible()
}

async function ask(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Ask the assistant' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

test.describe('Assistant', () => {
  test('answers from the site, drafts a document and lists what it did', async ({
    page,
    target,
  }) => {
    const { collection, fields } = target.site.pages
    const slug = 'assistant-e2e-draft'
    const prompt = 'Draft a page about opening hours'
    const reply = 'The draft is saved.'
    const script: ScriptStep[] = [
      {
        prompt,
        call: {
          name: 'create_draft',
          input: { collection, slug, fields: fields('Opening hours'), body: 'We open at nine.' },
        },
        reply,
      },
    ]
    await withModel(target, script, async (model) => {
      await openAssistant(page)
      await ask(page, prompt)
      const panel = page.getByRole('complementary', { name: 'Assistant' })
      await expect(panel).toContainText(reply)
      await expect(panel).toContainText(`Created draft ${collection}/${slug}`)

      // The model was offered the tools an editor may use, and the work is a draft
      expect(model.requests[0]?.tools).toEqual(
        expect.arrayContaining(['create_draft', 'publish_documents', 'search_documents']),
      )
      const saved = await readDocument(target, slug)
      expect(saved.meta.liveVersion).toBeNull()
      expect(saved.fields.title).toBe('Opening hours')
    })
  })

  test('publishing waits for the confirmation, and confirming makes the page live', async ({
    page,
    target,
  }) => {
    const slug = 'assistant-e2e-publish'
    const { collection } = target.site.pages
    await createDocument(target, pageDocument(target, slug, 'Assistant publish'))
    const prompt = 'Publish the assistant publish page'
    const script: ScriptStep[] = [
      {
        prompt,
        call: { name: 'publish_documents', input: { documents: [{ collection, slug }] } },
        reply: 'It is ready for your confirmation.',
      },
    ]
    await withModel(target, script, async () => {
      await openAssistant(page)
      await ask(page, prompt)
      const panel = page.getByRole('complementary', { name: 'Assistant' })
      await expect(panel.getByText('Needs your confirmation', { exact: true })).toBeVisible()
      // Proposed, not done: nothing is live yet
      expect((await readDocument(target, slug)).meta.liveVersion).toBeNull()

      await panel.getByRole('button', { name: 'Publish', exact: true }).click()
      await expect(panel.locator('.assistant-outcome-done')).toBeVisible()
      const live = await readDocument(target, slug)
      expect(live.meta.liveVersion).toBe(live.meta.version)
    })
  })

  test('cancelling a proposal leaves the document as it was', async ({ page, target }) => {
    const slug = 'assistant-e2e-cancel'
    const { collection } = target.site.pages
    await createDocument(target, pageDocument(target, slug, 'Assistant cancel'))
    const prompt = 'Publish the assistant cancel page'
    const script: ScriptStep[] = [
      {
        prompt,
        call: { name: 'publish_documents', input: { documents: [{ collection, slug }] } },
        reply: 'It is ready for your confirmation.',
      },
    ]
    await withModel(target, script, async () => {
      await openAssistant(page)
      await ask(page, prompt)
      const panel = page.getByRole('complementary', { name: 'Assistant' })
      await panel.getByRole('button', { name: 'Cancel' }).click()
      await expect(panel.getByText('Cancelled')).toBeVisible()
      expect((await readDocument(target, slug)).meta.liveVersion).toBeNull()
    })
  })
})
