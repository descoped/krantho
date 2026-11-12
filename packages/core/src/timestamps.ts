/**
 * Timestamps are stored as UTC with a Z (`2026-10-10T09:30:00Z`). People write
 * less: a date alone, a time with an offset, a time without a zone. These
 * read them all, and leave anything that is not a moment for validation to refuse.
 */

/** A date alone, or a date and a time with an optional zone; nothing may follow */
const MOMENT =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i

/** An offset as ISO 8601 writes it, `+02:00`; no zone, and Z, are UTC */
function zoneOf(zone: string | undefined): string {
  if (!zone || zone.toUpperCase() === 'Z') return 'Z'
  const digits = zone.replace(':', '')
  return `${digits.slice(0, 3)}:${digits.slice(3) || '00'}`
}

/** The UTC timestamp for what was written, or null when it is not a date or a time */
export function toUtcTimestamp(written: string): string | null {
  const parts = MOMENT.exec(written.trim())
  if (!parts) return null
  const [, date = '', time = '00:00', seconds = '00', fraction = '', zone] = parts
  // A date such as 2026-02-31 is rolled over by Date: it is not a real date
  const day = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null
  const moment = new Date(`${date}T${time}:${seconds}${fraction}${zoneOf(zone)}`)
  if (Number.isNaN(moment.getTime())) return null
  return moment.toISOString().replace('.000Z', 'Z')
}

/** The parts of a JSON Schema that say where a timestamp may be */
export interface TimestampSchema {
  type?: string | readonly string[] | undefined
  format?: string | undefined
  properties?: Readonly<Record<string, TimestampSchema>> | undefined
  items?: TimestampSchema | undefined
  anyOf?: readonly TimestampSchema[] | undefined
  oneOf?: readonly TimestampSchema[] | undefined
}

function normalizeOwn(schema: TimestampSchema, value: unknown): unknown {
  if (typeof value === 'string') {
    return schema.format === 'date-time' ? (toUtcTimestamp(value) ?? value) : value
  }
  const items = schema.items
  if (Array.isArray(value)) {
    return items ? value.map((entry) => normalizeTimestamps(items, entry)) : value
  }
  if (value !== null && typeof value === 'object') {
    const known = schema.properties ?? {}
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const property = known[key]
        return [key, property ? normalizeTimestamps(property, entry) : entry]
      }),
    )
  }
  return value
}

/** The value with each `date-time` string the schema declares written as a UTC timestamp */
export function normalizeTimestamps(schema: TimestampSchema, value: unknown): unknown {
  const options = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return options.reduce<unknown>(
    (current, option) => normalizeTimestamps(option, current),
    normalizeOwn(schema, value),
  )
}
