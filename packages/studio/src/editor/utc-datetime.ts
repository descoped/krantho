/**
 * A stored UTC timestamp as a `datetime-local` input shows it: the same moment, on the viewer's clock.
 * The input shows minutes, so a stored value with seconds is rounded down to the minute by its first edit.
 */
export function utcToLocalInput(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
  return `${date}T${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

/** What a `datetime-local` input holds (the viewer's clock) as the UTC timestamp that is stored: `2026-10-10T09:30:00Z` */
export function localInputToUtc(input: string): string {
  if (input === '') return ''
  const moment = new Date(input)
  if (Number.isNaN(moment.getTime())) return ''
  return `${moment.toISOString().slice(0, 19)}Z`
}
