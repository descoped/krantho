/**
 * The ORDER BY whitelist shared by every SQL adapter.
 *
 * A sort field arrives from a query string, so it can never be interpolated
 * into SQL unchecked. Columns named here are emitted literally; anything else
 * falls back to each adapter's JSON extraction expression, and only when it
 * matches {@link SORT_FIELD_PATTERN}. Both adapters read these values from here
 * so the two whitelists cannot drift apart.
 */
export const DIRECT_SORT_COLUMNS = ['slug', 'status', 'locale', 'created_at'] as const

/** A column of the content table that may be sorted on directly */
export type DirectSortColumn = (typeof DIRECT_SORT_COLUMNS)[number]

/** Characters allowed in a content field name used as a sort key */
export const SORT_FIELD_PATTERN = /^[\w-]+$/

/** Whether a sort field names a content table column that can be sorted directly */
export function isDirectSortColumn(field: string): field is DirectSortColumn {
  return (DIRECT_SORT_COLUMNS as readonly string[]).includes(field)
}

/** Whether a sort field is safe to interpolate into a JSON extraction expression */
export function isSafeSortField(field: string): boolean {
  return SORT_FIELD_PATTERN.test(field)
}
