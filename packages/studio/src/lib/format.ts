/** Format byte count as human-readable size */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format ISO date as UTC datetime string */
export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/**
 * A stored UTC timestamp as the viewer reads it: their locale, their clock and
 * its zone — `10. okt. 2026, 11:30 GMT+2` for a viewer in Norway. Empty when it is not a moment.
 * `timeZone` names another zone, for what is not the viewer's own clock.
 */
export function formatTimestamp(value: unknown, timeZone?: string): string {
  if (typeof value !== 'string' || value === '') return ''
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(moment)
}

/** A collection's name as a label: `case-studies` reads "Case studies" */
export function collectionLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A collection's singular noun, by the common English endings: `case-studies` →
 * "case study", `boxes` → "box", `services` → "service"; a name without a
 * trailing s stays as it is.
 */
export function singularLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim().toLowerCase()
  if (words.endsWith('ies')) return `${words.slice(0, -3)}y`
  if (/(s|x|z|ch|sh)es$/.test(words)) return words.slice(0, -2)
  return words.endsWith('s') ? words.slice(0, -1) : words
}

/** A time as a compact, sortable local date and time: `2026-10-02 14:05` */
export function formatShortDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
