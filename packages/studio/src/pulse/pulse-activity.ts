/**
 * Pulse's recent activity: each document's latest state, newest first. The
 * event is read from the document's versions — what the API knows — never
 * from a log it does not keep.
 */

import type { PulseDocument } from './pulse-model.js'

/** Created: version 1, never published. Published: the live version is the current one. Draft saved: otherwise. */
export type ActivityEvent = 'created' | 'published' | 'saved'

export const EVENT_LABELS: Readonly<Record<ActivityEvent, string>> = {
  created: 'Created',
  published: 'Published',
  saved: 'Draft saved',
}

export interface ActivityEntry {
  document: PulseDocument
  event: ActivityEvent
}

export function activityEvent(doc: PulseDocument): ActivityEvent {
  if (doc.liveVersion === null && doc.version === 1) return 'created'
  if (doc.liveVersion !== null && doc.liveVersion >= doc.version) return 'published'
  return 'saved'
}

/** How many entries the list shows */
const ACTIVITY_LIMIT = 8

/** The most recently updated documents, newest first, with what happened last */
export function recentActivity(
  documents: readonly PulseDocument[],
  limit: number = ACTIVITY_LIMIT,
): ActivityEntry[] {
  return [...documents]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((document) => ({ document, event: activityEvent(document) }))
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" — a date after a week */
export function relativeTime(iso: string, now: number = Date.now(), locale?: string): string {
  const then = new Date(iso).getTime()
  const elapsed = now - then
  if (elapsed < MINUTE) return 'just now'
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < 7 * DAY) return format.format(-Math.floor(elapsed / DAY), 'day')
  return new Date(then).toLocaleDateString(locale, { dateStyle: 'medium' })
}
