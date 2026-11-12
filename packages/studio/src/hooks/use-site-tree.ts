import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import type { CollectionInfo, ContentLock, DocumentMeta } from '../lib/api.js'
import { fetchCollections, fetchContentTree, fetchLocks } from '../lib/api.js'
import type { AuthUser } from '../lib/auth.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'
import { foreignLocks } from '../lib/locks.js'
import { LAYOUT_COLLECTION } from '../lib/paths.js'
import { useLocales } from './use-locales.js'

/** Locks and statuses refresh this often while Studio is open, in view and in use */
const REFRESH_MS = 60_000

/** Without this long of no interaction the refresh stops, so a left-open tab lets the database suspend */
const IDLE_MS = 10 * 60_000

/** What counts as someone being there */
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/** One document in the site tree */
export interface TreeDocument {
  collection: string
  slug: string
  status: DocumentStatus
  /** Who holds the edit lock (their email), when it is someone other than the viewer */
  lockedBy: string | null
}

/** A collection's group in the site tree */
export interface TreeGroup {
  collection: CollectionInfo
  documents: readonly TreeDocument[]
}

export interface SiteTree {
  /** One group per collection, globals excepted */
  groups: readonly TreeGroup[]
  /** The globals, or null when the site has none */
  layout: readonly TreeDocument[] | null
}

const EMPTY: SiteTree = { groups: [], layout: null }

function toDocuments(metas: readonly DocumentMeta[], held: Map<string, string>): TreeDocument[] {
  // One entry per slug
  const seen = new Set<string>()
  return metas
    .filter((meta) => !seen.has(meta.slug) && Boolean(seen.add(meta.slug)))
    .map((meta) => ({
      collection: meta.collection,
      slug: meta.slug,
      status: documentStatus(meta),
      lockedBy: held.get(`${meta.collection}/${meta.slug}`) ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

async function loadTree(locale: string, user: AuthUser | null): Promise<SiteTree> {
  const [collections, locks, { collections: trees }] = await Promise.all([
    fetchCollections(),
    fetchLocks().catch((): ContentLock[] => []),
    fetchContentTree(locale),
  ])
  const held = foreignLocks(locks, locale, user)
  const metas = new Map(trees.map((tree) => [tree.name, tree.documents]))
  const groups: TreeGroup[] = []
  let layout: TreeDocument[] | null = null
  for (const collection of collections) {
    const documents = toDocuments(metas.get(collection.name) ?? [], held)
    if (collection.name === LAYOUT_COLLECTION) layout = documents
    else groups.push({ collection, documents })
  }
  return { groups, layout }
}

/**
 * The site tree: every collection's documents in the site's default locale,
 * with their status and foreign locks. It refreshes on navigation, when the tab comes back
 * into view, every minute while it is in view and in use, and when `revision` changes. After
 * ten minutes without interaction it stops, and reads once when someone is back.
 */
export function useSiteTree(user: AuthUser | null, revision: number): SiteTree {
  const [tree, setTree] = useState<SiteTree>(EMPTY)
  const { pathname } = useLocation()
  const locale = useLocales()?.defaultLocale

  const refresh = useCallback(async (): Promise<SiteTree | null> => {
    if (locale === undefined) return null
    try {
      return await loadTree(locale, user)
    } catch (err: unknown) {
      console.warn('[studio] Failed to load the site tree:', err)
      return null
    }
  }, [locale, user])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and revision are refresh triggers
  useEffect(() => {
    let active = true
    const load = (): void => {
      void refresh().then((next) => {
        if (active && next) setTree(next)
      })
    }
    // Nothing is read while the tab is out of view, or after it has been left alone for a while
    const inView = (): boolean => document.visibilityState === 'visible'
    let lastSeen = Date.now()
    const idle = (): boolean => Date.now() - lastSeen >= IDLE_MS
    const tick = (): void => {
      if (inView() && !idle()) load()
    }
    // Someone is back: after a long quiet it reads once, then the minute timer carries on
    const onActivity = (): void => {
      const away = idle()
      lastSeen = Date.now()
      if (away && inView()) load()
    }
    const onVisibility = (): void => {
      if (!inView()) return
      lastSeen = Date.now()
      load()
    }
    load()
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    for (const type of ACTIVITY) document.addEventListener(type, onActivity, { passive: true })
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const type of ACTIVITY) document.removeEventListener(type, onActivity)
    }
  }, [refresh, pathname, revision])

  return tree
}
