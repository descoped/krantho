import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_WEBHOOK_ATTEMPTS } from '@krantho/persistence'
import { openDatabase, SqliteLockAdapter } from '@krantho/persistence-sqlite'
import { test as base } from '@playwright/test'
import { dataDirFor, type E2eTarget, targetNamed } from './targets.js'

/** The running target a test talks to */
export interface Target {
  /** The target's origin, e.g. `http://localhost:4102` */
  baseURL: string
  /** The data directory its server runs on; holds `content.db` */
  dataDir: string
  /** What the target is: its preview, its sitemap and the collection the specs write to */
  site: E2eTarget
}

/** A document to create or save through the HTTP API */
export interface SeedDocument {
  collection: string
  slug: string
  fields: Record<string, unknown>
  body?: string | undefined
  locale?: string | undefined
}

/** What the API reports after a create or save */
export interface SavedDocument {
  slug: string
  collection: string
  version: number
  liveVersion: number | null
}

/** The user the seeded foreign locks belong to */
export const OTHER_USER = 'other@e2e.local'

/** How long a seeded foreign lock lasts */
const FOREIGN_LOCK_MS = 5 * 60 * 1000

interface Sent {
  status: number
  text: string
}

/** The helpers send no credentials: the targets they write to run with sign-in off */
async function send(
  target: Target,
  method: 'POST' | 'PUT',
  path: string,
  payload: unknown,
): Promise<Sent> {
  const res = await fetch(new URL(path, target.baseURL), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, text: await res.text() }
}

/** The answer's JSON; a status that is not 2xx throws, saying what failed */
function answered(method: string, path: string, { status, text }: Sent): unknown {
  if (status < 200 || status >= 300)
    throw new Error(`${method} ${path} failed with ${status}: ${text}`)
  return JSON.parse(text) as unknown
}

async function sendJson(
  target: Target,
  method: 'POST' | 'PUT',
  path: string,
  payload: unknown,
): Promise<unknown> {
  return answered(method, path, await send(target, method, path, payload))
}

function documentPath(collection: string, slug: string): string {
  return `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`
}

/** Create a new document (`POST /api/content/:collection`) */
export async function createDocument(target: Target, doc: SeedDocument): Promise<SavedDocument> {
  const path = `/api/content/${encodeURIComponent(doc.collection)}`
  const sent = await send(target, 'POST', path, {
    slug: doc.slug,
    fields: doc.fields,
    body: doc.body ?? '',
    ...(doc.locale ? { locale: doc.locale } : {}),
  })
  // A seed run again — a worker restarted after a failure — finds its document there: save it
  if (sent.status === 409) return saveDocument(target, { ...doc, body: doc.body ?? '' })
  return answered('POST', path, sent) as SavedDocument
}

/** Save a new version of an existing document (`PUT /api/content/:collection/:slug`) */
export async function saveDocument(target: Target, doc: SeedDocument): Promise<SavedDocument> {
  return (await sendJson(target, 'PUT', documentPath(doc.collection, doc.slug), {
    fields: doc.fields,
    ...(doc.body !== undefined ? { body: doc.body } : {}),
    ...(doc.locale ? { locale: doc.locale } : {}),
  })) as SavedDocument
}

/** Make a document's current version live (`POST /api/content/:collection/:slug/publish`) */
export async function publishDocument(
  target: Target,
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<void> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : ''
  await sendJson(target, 'POST', `${documentPath(collection, slug)}/publish${query}`, {
    status: 'published',
  })
}

/** The site's default locale, as Setup › Locales and the API report it */
async function defaultLocaleOf(target: Target): Promise<string> {
  const res = await fetch(new URL('/api/settings/locales', target.baseURL))
  if (!res.ok) throw new Error(`GET /api/settings/locales failed with ${res.status}`)
  const { defaultLocale } = (await res.json()) as { defaultLocale?: unknown }
  if (typeof defaultLocale !== 'string') throw new Error('The target names no default locale')
  return defaultLocale
}

/**
 * Hold a document's edit lock as another user, written straight into the
 * target's SQLite database as a second editor's session would leave it — in
 * the site's default locale, the version Studio opens.
 */
export async function seedForeignLock(
  target: Target,
  collection: string,
  slug: string,
): Promise<void> {
  const lockLocale = await defaultLocaleOf(target)
  const dbPath = join(target.dataDir, 'content.db')
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath} — has the target started?`)
  const db = openDatabase(dbPath)
  try {
    const expiresAt = new Date(Date.now() + FOREIGN_LOCK_MS).toISOString()
    await new SqliteLockAdapter(db).acquireLock(collection, slug, lockLocale, OTHER_USER, expiresAt)
  } finally {
    db.close()
  }
}

/**
 * A webhook delivery the log holds as failed — every attempt used, never
 * delivered — written straight into the target's SQLite database as the
 * delivery log leaves one. Returns its id.
 */
export function seedFailedDelivery(target: Target, url: string): number {
  const db = openDatabase(join(target.dataDir, 'content.db'))
  try {
    const row = db
      .prepare(
        `INSERT INTO webhook_deliveries (webhook_url, event, payload, status, attempts)
         VALUES (?, 'publish', '{}', 503, ?) RETURNING id`,
      )
      .get(url, MAX_WEBHOOK_ATTEMPTS) as { id?: unknown } | undefined
    if (typeof row?.id !== 'number') throw new Error('The failed delivery could not be seeded')
    return row.id
  } finally {
    db.close()
  }
}

/** Remove a seeded delivery again */
export function dropDelivery(target: Target, id: number): void {
  const db = openDatabase(join(target.dataDir, 'content.db'))
  try {
    db.prepare('DELETE FROM webhook_deliveries WHERE id = ?').run(id)
  } finally {
    db.close()
  }
}

/** A public page as a visitor receives it */
export interface PublicPage {
  status: number
  html: string
}

/** Read a public page's HTML with a plain request, as a visitor would */
export async function readPublicPage(target: Target, path: string): Promise<PublicPage> {
  const res = await fetch(new URL(path, target.baseURL))
  return { status: res.status, html: await res.text() }
}

/** A document of the collection the target's pages are written to, with every required field */
export function pageDocument(target: Target, slug: string, title: string, body = ''): SeedDocument {
  const { collection, fields } = target.site.pages
  return { collection, slug, fields: fields(title), body }
}

/** Playwright's `test` with the running `target` of the current project */
export const test = base.extend<{ target: Target }>({
  target: async ({ baseURL }, use, testInfo) => {
    if (!baseURL) throw new Error(`Project ${testInfo.project.name} sets no baseURL`)
    const name = testInfo.project.name
    await use({ baseURL, dataDir: dataDirFor(name), site: targetNamed(name) })
  },
})

export { expect } from '@playwright/test'
