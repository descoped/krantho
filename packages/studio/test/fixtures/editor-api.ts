import { documentPath, invalidationsFor } from '@krantho/core/cache-tags'
import { DOCUMENT_SEO_METADATA_SCHEMA } from '@krantho/seo-shared'
import { screen } from '@testing-library/react'
import type { CollectionSchema } from '../../src/lib/api.js'
import { type FakeOptions, installApi, json, type Route, renderAt } from './site-api.js'

// ---------------------------------------------------------------------------
// A fake document store behind the editor: one page, saved, published and locked as asked
// ---------------------------------------------------------------------------

/** Node's own `localStorage` shadows jsdom's: each test gets a fresh one */
export function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

export const SCHEMA: CollectionSchema = {
  contract: {
    id: 'test/content',
    revision: 'test',
    label: 'Content',
    fields: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The page heading' },
        'meta-description': { type: 'string' },
        'meta-description-Notes': { type: 'string' },
        description: { type: 'string' },
        hero: { type: 'string', description: 'media' },
        status: { type: 'string', enum: ['draft', 'published'] },
      },
      required: ['title'],
    },
    metadata: {
      seo: {
        id: 'test/seo',
        revision: 'test',
        label: 'Structured data',
        required: false,
        schema: DOCUMENT_SEO_METADATA_SCHEMA,
      },
    },
    body: 'optional',
    sections: [],
  },

  name: 'pages',
  source: 'database',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The page heading' },
      'meta-description': { type: 'string' },
      'meta-description-Notes': { type: 'string' },
      description: { type: 'string' },
      hero: { type: 'string', description: 'media' },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
    required: ['title'],
  },
}

export interface FakeDoc {
  metadata?: Record<string, Record<string, unknown>> | undefined
  slug: string
  version: number
  liveVersion: number | null
  fields: Record<string, unknown>
  body?: string | undefined
  /** The version's locale; English by default */
  locale?: string | undefined
  /** Set by a status change; otherwise read from the live version */
  status?: 'draft' | 'published' | 'archived' | undefined
}

export interface StoreOptions {
  doc: FakeDoc
  /** The document's collection; `pages` by default, `globals` for a global */
  collection?: string | undefined
  /** Someone else holds the edit lock */
  lockedBy?: string | undefined
  cachedEntries?: number | null | undefined
  /** A save answers only once this settles */
  saveGate?: Promise<void> | undefined
  /** The answers to taking the lock, in turn; the last one repeats */
  locks?: ReadonlyArray<() => Response> | undefined
}

export function contentOf(doc: FakeDoc, collection = 'pages'): Record<string, unknown> {
  return {
    metadata: doc.metadata ?? {},
    contract: null,
    defaults: [],
    repositoryBasis: null,

    meta: {
      collection,
      slug: doc.slug,
      locale: doc.locale ?? 'en',
      version: doc.version,
      liveVersion: doc.liveVersion,
      status: doc.status ?? (doc.liveVersion === null ? 'draft' : 'published'),
      source: 'database',
      changedBy: 'editor:person@example.test',
      createdAt: '2026-10-02T10:00:00.000Z',
    },
    fields: doc.fields,
    body: doc.body ?? '## Intro\n\nHello.',
    html: '',
    sections: {},
  }
}

export const heldLock = (): Response =>
  json({
    locked: true,
    lockedBy: 'admin:anonymous',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })

export const foreignLock = (holder: string) => (): Response =>
  json(
    { error: 'locked', lockedBy: holder, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    423,
  )

/** The lock endpoint: the given answers in turn, the last one repeating */
export function lockRoute({ lockedBy, locks }: StoreOptions): Route {
  const answers = locks ?? [lockedBy ? foreignLock(lockedBy) : heldLock]
  let asked = 0
  return () => {
    const answer = answers[Math.min(asked, answers.length - 1)] ?? heldLock
    asked += 1
    return answer()
  }
}

/** A save: refused as a conflict unless it names the current version */
function saveRoute({ doc, saveGate }: StoreOptions): Route {
  return async (body) => {
    await saveGate
    const sent = body as {
      metadata: Record<string, Record<string, unknown>>
      fields: Record<string, unknown>
      body: string
      _version?: number
    }
    if (sent._version !== doc.version) {
      return json(
        { error: 'modified', currentVersion: doc.version, yourVersion: sent._version },
        409,
      )
    }
    doc.version += 1
    doc.metadata = sent.metadata
    doc.fields = sent.fields
    doc.body = sent.body
    return json({ slug: doc.slug, version: doc.version, liveVersion: doc.liveVersion })
  }
}

/**
 * A publication change, as the API makes it: a new version with the same
 * content; publishing makes it live, unpublishing and archiving clear the live one
 */
function publishRoute(doc: FakeDoc, collection: string): Route {
  return (body) => {
    const status = (body as { status?: FakeDoc['status'] } | undefined)?.status ?? 'published'
    doc.version += 1
    doc.liveVersion = status === 'published' ? doc.version : null
    doc.status = status
    const { slug, version, liveVersion } = doc
    return json({ slug, collection, locale: 'en', status, version, liveVersion })
  }
}

/**
 * What publishing refreshes, as the publish-impact handler works it out: the
 * document's path and tags by core's own rule, so a global — which has no
 * page — reports every page that reads it
 */
function impactRoute(doc: FakeDoc, collection: string, cachedEntries: number | null): Route {
  const locale = doc.locale ?? 'en'
  const path = documentPath({ name: collection }, doc.slug)
  const change = { kind: 'document', collection, slug: doc.slug, locale, live: true } as const
  return () =>
    json({
      collection,
      slug: doc.slug,
      locale,
      paths: path === null ? [] : [path],
      lists: [collection],
      everyPageReading: path === null,
      caching: 'next-isr',
      tags: invalidationsFor(change).flatMap((invalidation) => invalidation.tags),
      cachedEntries,
    })
}

/** The store's routes for one document; it changes as the editor saves and publishes */
export function storeRoutes(options: StoreOptions): Record<string, Route> {
  const { doc, cachedEntries = null, collection = 'pages' } = options
  const base = `/api/content/${collection}/${doc.slug}`
  return {
    [`GET /api/schema/${collection}`]: () => json({ ...SCHEMA, name: collection }),
    [`GET ${base}`]: () => json(contentOf(doc, collection)),
    [`POST ${base}/lock`]: lockRoute(options),
    [`DELETE ${base}/lock`]: () => json({ locked: false }),
    [`PUT ${base}`]: saveRoute(options),
    [`POST ${base}/publish`]: publishRoute(doc, collection),
    [`GET ${base}/publish-impact`]: impactRoute(doc, collection, cachedEntries),
    [`GET ${base}/versions`]: () => json({ versions: [] }),
    'POST /api/content/pages': () => json({ slug: doc.slug, version: 1, liveVersion: null }, 201),
    'GET /api/seo/config/collection:pages': () => json({ config: null }),
    'GET /api/seo/config': () => json({ config: null }),
  }
}

export function aheadDoc(): FakeDoc {
  return {
    slug: 'pricing',
    version: 3,
    liveVersion: 2,
    fields: { title: 'Pricing', description: 'What it costs' },
  }
}

/**
 * Open the document's editor in a mode — Structure unless asked; `null` opens
 * it without `?mode=`, in the mode a page opens in (Live)
 */
export function openEditor(
  options: StoreOptions,
  more: Omit<FakeOptions, 'routes'> & {
    routes?: Record<string, Route> | undefined
    mode?: string | null | undefined
  } = {},
): ReturnType<typeof installApi> {
  const { mode = 'structure', ...api } = more
  const calls = installApi({ ...api, routes: { ...storeRoutes(options), ...more.routes } })
  renderAt(`/site/pages/${options.doc.slug}${mode === null ? '' : `?mode=${mode}`}`)
  return calls
}

export async function header(): Promise<HTMLElement> {
  const tabs = await screen.findByRole('tablist', { name: 'Mode' })
  return tabs.parentElement as HTMLElement
}

export const KEPT_REGION = 'Unsaved changes kept in this browser'

/**
 * Load the editor's lazily imported modules before the first test, so its
 * first render does not spend the test's time on the import under load
 */
export async function warmEditor(): Promise<void> {
  await Promise.all([
    import('../../src/editor/editor-page.js'),
    import('../../src/editor/data-mode/data-mode.js'),
    import('../../src/editor/side-panel/side-panel.js'),
    import('../../src/media/media-picker.js'),
    import('../../src/shell/app-shell.js'),
    import('../../src/pulse/pulse-page.js'),
  ])
}

/** How long warming may take on a loaded machine */
export const WARM_TIMEOUT_MS = 60_000
