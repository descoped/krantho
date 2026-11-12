import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aheadDoc,
  contentOf,
  header,
  KEPT_REGION,
  memoryStorage,
  openEditor,
  WARM_TIMEOUT_MS,
  warmEditor,
} from './fixtures/editor-api.js'
import { installApi, json, renderAt } from './fixtures/site-api.js'

/** A schema with a required list, a counted text and a required image */
const FIELDS_SCHEMA = {
  'GET /api/schema/pages': () =>
    json({
      contract: {
        id: 'test/content',
        revision: 'test',
        label: 'Content',
        fields: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string', maxLength: 500 },
            hero: { type: 'string', description: 'media' },
          },
          required: ['title', 'tags', 'hero'],
        },
        metadata: {},
        body: 'optional',
        sections: [],
      },

      name: 'pages',
      source: 'database',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string', maxLength: 500 },
          hero: { type: 'string', description: 'media' },
        },
        required: ['title', 'tags', 'hero'],
      },
    }),
}

beforeAll(warmEditor, WARM_TIMEOUT_MS)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('field inputs', () => {
  it('marks the tag input required', async () => {
    openEditor({ doc: aheadDoc() }, { routes: FIELDS_SCHEMA })
    await header()
    const tags = await screen.findByRole('textbox', { name: 'tags' })
    expect(tags).toHaveAttribute('aria-required', 'true')
  })

  it('describes a counted text with its count', async () => {
    const doc = { ...aheadDoc(), fields: { title: 'Pricing', summary: 'Short' } }
    openEditor({ doc }, { routes: FIELDS_SCHEMA })
    await header()
    const summary = await screen.findByRole('textbox', { name: 'summary' })
    expect(summary).toHaveAccessibleDescription('5 of 500 characters')
  })

  it('says a media field is required, and not valid once a save refused it', async () => {
    openEditor(
      { doc: aheadDoc() },
      {
        routes: {
          ...FIELDS_SCHEMA,
          'PUT /api/content/pages/pricing': () =>
            json(
              {
                error: 'Validation failed',
                details: [{ field: 'hero', message: 'Choose an image' }],
              },
              422,
            ),
        },
      },
    )
    const bar = await header()
    const hero = await screen.findByRole('group', { name: 'hero' })
    expect(hero).toHaveAccessibleDescription('Required')
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'title' }), '!')
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Choose an image')).toBeInTheDocument()
    expect(hero).toHaveAccessibleDescription('Required, not valid Choose an image')
    expect(within(hero).getByRole('button', { name: 'Choose image' })).toHaveAccessibleDescription(
      'Required, not valid Choose an image',
    )
  })

  it('announces the media picker loading', async () => {
    openEditor({ doc: aheadDoc() }, { pending: ['/api/media'] })
    await header()
    const hero = await screen.findByRole('group', { name: 'hero' })
    await userEvent.setup().click(within(hero).getByRole('button', { name: 'Choose image' }))
    const dialog = await screen.findByRole('dialog')
    // The upload's own progress is a status region too, empty until an upload runs
    const statuses = within(dialog).getAllByRole('status')
    expect(statuses.map((status) => status.textContent)).toContain('Loading media…')
  })

  it('leaves a cleared number out of the save, and a global keeps the cleared field’s row', async () => {
    const footer = { title: { type: 'string' }, order: { type: 'number' } }
    const doc = {
      slug: 'footer',
      version: 1,
      liveVersion: 1,
      fields: { title: 'Footer', order: 3 },
    }
    const calls = installApi({
      routes: {
        'GET /api/schema/globals': () =>
          json({
            contract: {
              id: 'test/content',
              revision: 'test',
              label: 'Content',
              fields: { properties: footer },
              metadata: {},
              body: 'optional',
              sections: [],
            },
            name: 'globals',
            source: 'database',
            schema: { properties: footer },
          }),
        'GET /api/content/globals/footer': () => json(contentOf(doc, 'globals')),
        'POST /api/content/globals/footer/lock': () => json({ locked: true }),
        'PUT /api/content/globals/footer': () =>
          json({ slug: 'footer', collection: 'globals', version: 2, liveVersion: 1 }),
      },
    })
    renderAt('/layout/footer')
    const bar = await header()
    const user = userEvent.setup()
    const order = await screen.findByRole('spinbutton', { name: 'order' })
    await user.clear(order)
    expect(screen.getByRole('spinbutton', { name: 'order' })).toHaveValue(null)
    await user.click(within(bar).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => {
      const sent = calls.find((c) => c.key === 'PUT /api/content/globals/footer')?.body as
        | { fields: Record<string, unknown> }
        | undefined
      expect(sent?.fields).toEqual({ title: 'Footer' })
    })
    expect(screen.getByRole('spinbutton', { name: 'order' })).toBeInTheDocument()
  })

  it('keeps a global’s rows when restored work leaves a field out', async () => {
    const footer = { title: { type: 'string' }, order: { type: 'number' } }
    const doc = {
      slug: 'footer',
      version: 1,
      liveVersion: 1,
      fields: { title: 'Footer', order: 3 },
    }
    localStorage.setItem(
      'krantho-autosave-globals-footer-en',
      JSON.stringify({
        metadata: {},

        fields: { title: 'Kept' },
        body: '',
        baseVersion: 1,
        savedAt: '2026-10-02T09:00:00.000Z',
      }),
    )
    installApi({
      routes: {
        'GET /api/schema/globals': () =>
          json({
            contract: {
              id: 'test/content',
              revision: 'test',
              label: 'Content',
              fields: { properties: footer },
              metadata: {},
              body: 'optional',
              sections: [],
            },
            name: 'globals',
            source: 'database',
            schema: { properties: footer },
          }),
        'GET /api/content/globals/footer': () => json(contentOf(doc, 'globals')),
        'POST /api/content/globals/footer/lock': () => json({ locked: true }),
      },
    })
    renderAt('/layout/footer')
    const notice = await screen.findByRole('region', { name: KEPT_REGION })
    await userEvent.setup().click(within(notice).getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Kept')
    expect(screen.getByRole('spinbutton', { name: 'order' })).toHaveValue(null)
  })
})
