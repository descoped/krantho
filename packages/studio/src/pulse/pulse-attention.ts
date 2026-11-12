/**
 * Pulse's "Needs attention": one row per thing an editor can act on, from the
 * sources the site has. A source that is off or unreadable adds no rows.
 */

import type { CollectionTranslationStatus, ContentLock, WebhookDelivery } from '../lib/api.js'
import { collectionLabel } from '../lib/format.js'
import { lockHolderName } from '../lib/locks.js'
import { editorPath, LAYOUT_COLLECTION } from '../lib/paths.js'
import type { PulseDocument, PulseScope } from './pulse-model.js'

/** What a row is about — it picks the row's icon and tint */
export type AttentionKind = 'delivery' | 'lock' | 'ahead' | 'meta' | 'locale'

export interface AttentionRow {
  key: string
  kind: AttentionKind
  title: string
  detail: string
  /** The action button's word: Review, Open log, Fix, Open, Locales */
  action: string
  /** Where the action goes */
  to: string
}

/** Rows of one kind left out, past the cap */
export interface AttentionOverflow {
  kind: AttentionKind
  count: number
}

export interface Attention {
  rows: AttentionRow[]
  overflow: AttentionOverflow[]
}

/** The failed webhook deliveries: how many, and the latest */
export interface FailedDeliveries {
  total: number
  latest: WebhookDelivery | null
}

export interface AttentionSources {
  /** Every document in every locale */
  documents: readonly PulseDocument[]
  scope: PulseScope
  /** Locks held by someone other than the viewer; null when they could not be read */
  locks: readonly ContentLock[] | null
  /** Null when deliveries are off or could not be read */
  deliveries: FailedDeliveries | null
  /** Null when the site has one locale or the status could not be read */
  translations: readonly CollectionTranslationStatus[] | null
}

/** At most this many rows of one kind; the rest are counted */
export const ROWS_PER_KIND = 5

/** The order kinds are listed in: what breaks first, what is cosmetic last */
const KIND_ORDER: readonly AttentionKind[] = ['delivery', 'lock', 'ahead', 'meta', 'locale']

/** The editor of a document, with its locale when it is not the default */
function documentLink(
  doc: { collection: string; slug: string; locale: string },
  scope: PulseScope,
): string {
  const locale = doc.locale === scope.defaultLocale ? undefined : doc.locale
  return editorPath(doc.collection, doc.slug, locale)
}

function newestFirst(a: PulseDocument, b: PulseDocument): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}

function groupLabel(collection: string): string {
  return collection === LAYOUT_COLLECTION ? 'Layout' : collectionLabel(collection)
}

function aheadRows(documents: readonly PulseDocument[], scope: PulseScope): AttentionRow[] {
  return documents
    .filter((doc) => doc.status === 'ahead')
    .sort(newestFirst)
    .map((doc) => ({
      key: `ahead:${doc.collection}/${doc.slug}/${doc.locale}`,
      kind: 'ahead',
      title: `${doc.title} has unpublished changes`,
      detail: `${groupLabel(doc.collection)} · version ${doc.liveVersion} is live, version ${doc.version} is saved`,
      action: 'Review',
      to: documentLink(doc, scope),
    }))
}

function metaRows(documents: readonly PulseDocument[], scope: PulseScope): AttentionRow[] {
  return documents
    .filter(
      (doc) =>
        scope.pageCollections.has(doc.collection) &&
        doc.locale === scope.defaultLocale &&
        doc.metaDescription === 'missing',
    )
    .sort(newestFirst)
    .map((doc) => ({
      key: `meta:${doc.collection}/${doc.slug}`,
      kind: 'meta',
      title: `${doc.title} has no meta description`,
      detail: `${groupLabel(doc.collection)} · neither meta-description nor description is set`,
      action: 'Fix',
      to: documentLink(doc, scope),
    }))
}

function lockRows(sources: AttentionSources): AttentionRow[] {
  const titles = new Map(
    sources.documents.map((doc) => [`${doc.collection}/${doc.slug}/${doc.locale}`, doc.title]),
  )
  return [...(sources.locks ?? [])]
    .sort((a, b) => b.lockedAt.localeCompare(a.lockedAt))
    .map((lock) => {
      const id = `${lock.collection}/${lock.slug}/${lock.locale}`
      return {
        key: `lock:${id}`,
        kind: 'lock',
        title: `${titles.get(id) ?? lock.slug} is being edited by ${lockHolderName(lock.lockedBy)}`,
        detail: `${groupLabel(lock.collection)} · locked until ${clockTime(lock.expiresAt)}`,
        action: 'Open',
        to: documentLink(lock, sources.scope),
      }
    })
}

function deliveryRows(deliveries: FailedDeliveries | null): AttentionRow[] {
  if (!deliveries || deliveries.total === 0) return []
  const { total, latest } = deliveries
  return [
    {
      key: 'delivery:failed',
      kind: 'delivery',
      title: total === 1 ? '1 webhook delivery failed' : `${total} webhook deliveries failed`,
      detail: latest ? `Latest: ${latest.event} to ${latest.url}` : 'See the delivery log',
      action: 'Open log',
      to: '/setup/integrations',
    },
  ]
}

function localeRows(translations: readonly CollectionTranslationStatus[] | null): AttentionRow[] {
  return (translations ?? []).flatMap((status) => {
    const incomplete = status.items.filter((item) => item.missing.length > 0)
    if (incomplete.length === 0) return []
    const missing = [...new Set(incomplete.flatMap((item) => item.missing))].sort()
    const count = incomplete.length
    return [
      {
        key: `locale:${status.collection}`,
        kind: 'locale',
        title: `${groupLabel(status.collection)}: ${count} ${count === 1 ? 'document is' : 'documents are'} missing a locale version`,
        detail: `No version in ${missing.join(', ')}`,
        action: 'Locales',
        to: '/setup/locales',
      },
    ]
  })
}

/** Hours and minutes in the viewer's locale */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Every row the sources give, kinds in order, each kind capped at {@link ROWS_PER_KIND} */
export function needsAttention(sources: AttentionSources): Attention {
  const byKind: Record<AttentionKind, AttentionRow[]> = {
    delivery: deliveryRows(sources.deliveries),
    lock: lockRows(sources),
    ahead: aheadRows(sources.documents, sources.scope),
    meta: metaRows(sources.documents, sources.scope),
    locale: localeRows(sources.translations),
  }
  const rows: AttentionRow[] = []
  const overflow: AttentionOverflow[] = []
  for (const kind of KIND_ORDER) {
    const all = byKind[kind]
    rows.push(...all.slice(0, ROWS_PER_KIND))
    if (all.length > ROWS_PER_KIND) overflow.push({ kind, count: all.length - ROWS_PER_KIND })
  }
  return { rows, overflow }
}
