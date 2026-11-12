/**
 * An optional data source of a screen: read, off for this site or viewer, or
 * failed. A screen shows an optional source's rows and figures only when it was
 * read, and says so when it could not be — never a zero by default.
 */

import { ApiError } from './api-client.js'

export type Source<T> = { state: 'ok'; value: T } | { state: 'off' } | { state: 'failed' }

/** Read an optional source; a refusal for the viewer's role counts as off */
export async function optionalSource<T>(on: boolean, load: () => Promise<T>): Promise<Source<T>> {
  if (!on) return { state: 'off' }
  try {
    return { state: 'ok', value: await load() }
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 403) return { state: 'off' }
    return { state: 'failed' }
  }
}

/** An optional source's value, or null when it is off or was not read */
export function sourceValue<T>(source: Source<T>): T | null {
  return source.state === 'ok' ? source.value : null
}
