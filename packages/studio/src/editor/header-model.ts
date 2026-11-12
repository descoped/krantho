import { documentPath } from '@krantho/core/cache-tags'
import type { CollectionInfo } from '../lib/api-types.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'
import { pageUrl } from '../site/site-model.js'

/**
 * What the editor's header says and offers, from the document's versions, the
 * edit lock and the unsaved work — pure, so every state is tested without a screen.
 */

/** The document's saved versions; null for a document not saved yet */
export interface SavedVersions {
  version: number
  liveVersion: number | null
}

/** Everything the header's state depends on */
export interface HeaderFacts {
  saved: SavedVersions | null
  /** Unsaved changes in the form */
  dirty: boolean
  /** A save or a publish is under way */
  busy: boolean
  /** The viewer's role may edit */
  canEdit: boolean
  /** Someone else holds the edit lock: their name */
  lockedBy: string | null
  /** The form's work is based on another version than the saved one (restored kept work) */
  rebased: boolean
  /** A save was refused because a newer version exists, and the person has not answered it */
  conflict: boolean
}

/** The one status chip: a new document is not published either */
export function headerStatus(saved: SavedVersions | null): DocumentStatus {
  return saved ? documentStatus(saved) : 'draft'
}

/** The version detail in the status chip's popover: "Draft v5 · live is v4" */
export function versionDetail(saved: SavedVersions | null): string {
  if (!saved) return 'Not saved yet'
  const { version, liveVersion } = saved
  if (liveVersion === null) return `Draft v${version} · nothing is live`
  if (liveVersion >= version) return `v${version} is live`
  return `Draft v${version} · live is v${liveVersion}`
}

/** Why Save draft is unavailable, or null when it can save */
export function saveBlocker(facts: HeaderFacts): string | null {
  if (!facts.canEdit) return 'Your role cannot edit'
  if (facts.lockedBy) return `${facts.lockedBy} is editing`
  if (facts.busy) return 'Working…'
  // Restored work made on an older version still needs saving (and answering the conflict)
  if (facts.saved && !facts.dirty && !facts.rebased) return 'No unsaved changes'
  return null
}

/** Why Publish is unavailable, or null when it can publish the saved version */
export function publishBlocker(facts: HeaderFacts): string | null {
  if (!facts.canEdit) return 'Your role cannot publish'
  if (!facts.saved) return 'Save the draft first'
  if (facts.lockedBy) return `${facts.lockedBy} is editing`
  if (facts.busy) return 'Working…'
  if (facts.dirty) return 'Save the draft first: Publish makes the saved version live'
  if (headerStatus(facts.saved) === 'live') return `v${facts.saved.version} is live`
  return null
}

/**
 * Why a status change (Unpublish, Archive, Restore to draft) is unavailable, or
 * null when it can run. Each appends a version, so it waits until the form's
 * work is saved: unsaved changes, restored work on an older version, or an
 * unanswered conflict would otherwise be left based on a version that is gone.
 */
export function statusBlocker(facts: HeaderFacts): string | null {
  if (facts.lockedBy) return `${facts.lockedBy} is editing`
  if (facts.busy) return 'Working…'
  if (facts.conflict) return 'Answer the version conflict first'
  if (facts.dirty || facts.rebased) return 'Save the draft first'
  return null
}

/** The toast after Save draft: the live page is unchanged until the version is published */
export function saveToast(saved: SavedVersions): string {
  const { version, liveVersion } = saved
  // A store without history makes every save live at once (the filesystem adapter)
  if (liveVersion !== null && liveVersion >= version) {
    return `Saved · v${version}. It is live: this store publishes every save.`
  }
  if (liveVersion === null) return `Draft saved · v${version}. Nothing is live until you publish.`
  return `Draft saved · v${version}. The live page is unchanged until you publish.`
}

/** The publish confirmation's title */
export function publishTitle(slug: string, version: number): string {
  return `Publish ${slug} v${version}?`
}

/** What visitors see now, for the publish confirmation */
export function publishLead(saved: SavedVersions): string {
  if (saved.liveVersion === null) return `Nothing is live yet. Visitors will see v${saved.version}.`
  return `Visitors see v${saved.liveVersion} now and will see v${saved.version}.`
}

/** Where Open on site goes: the draft preview, or the live page */
export interface SiteLink {
  href: string
  kind: 'preview' | 'live'
}

export interface SiteLinkInput {
  /** The collection as the API lists it; null when it is not listed */
  collection: CollectionInfo | null
  slug: string
  liveVersion: number | null
  /** The site renders drafts for this viewer (`sitePreview`, and a role that may edit) */
  preview: boolean
  baseUrl: string | null
}

/**
 * Open on site, for a document with a page: the draft through `/api/preview`
 * when the site renders drafts, otherwise the live page — and nothing while no
 * version is live, since there is no page to open.
 */
export function siteLink(input: SiteLinkInput): SiteLink | null {
  const { collection, slug, liveVersion, preview, baseUrl } = input
  const path = collection ? documentPath(collection, slug) : null
  if (!collection || path === null) return null
  if (preview) {
    const query = new URLSearchParams({ collection: collection.name, slug })
    return { kind: 'preview', href: `/api/preview?${query}` }
  }
  if (liveVersion === null || !baseUrl) return null
  return { kind: 'live', href: pageUrl(baseUrl, path) }
}

/**
 * A status change that publishes nothing: unpublish keeps the page a draft,
 * archive marks it archived, unarchive makes an archived page a draft again
 */
export type StatusChange = 'unpublish' | 'archive' | 'unarchive'
