import { useCallback, useEffect, useMemo, useState } from 'react'
import { createContentItem, fetchContent } from '../lib/api.js'
import { ApiError } from '../lib/api-client.js'
import { type DocumentStatus, documentStatus } from '../lib/document-status.js'

/** Whether the document has its own version in a locale; unknown when that could not be read */
export type VersionState = 'exists' | 'missing' | 'unknown'

/** A locale's version as read: whether it exists, and its status when it does */
export interface VersionRead {
  state: VersionState
  status: DocumentStatus | null
}

/** A missing version answers 404, or with another locale's version in its place */
async function readVersion(collection: string, slug: string, locale: string): Promise<VersionRead> {
  try {
    const document = await fetchContent(collection, slug, locale)
    if (document.meta.locale !== locale) return { state: 'missing', status: null }
    return { state: 'exists', status: documentStatus(document.meta) }
  } catch (err: unknown) {
    const state = err instanceof ApiError && err.status === 404 ? 'missing' : 'unknown'
    return { state, status: null }
  }
}

/** Create only over a version known to be missing: one created meanwhile, or one that cannot be checked, is refused */
function refuseUnlessMissing(state: VersionState, locale: string, slug: string): void {
  const name = locale.toUpperCase()
  if (state === 'exists') {
    throw new Error(`The ${name} version of ${slug} exists now: someone created it. Open it.`)
  }
  if (state === 'unknown') {
    throw new Error(
      `Could not check whether the ${name} version of ${slug} exists, so nothing was created. Try again.`,
    )
  }
}

/**
 * Create a document's version in a locale, copied from the default locale's
 * fields and body, as a new draft. Read again first: a version created
 * meanwhile, or one that cannot be checked, is refused rather than
 * overwritten. `onRead` hears what that read found.
 */
export async function createLocaleVersion(
  collection: string,
  slug: string,
  locale: string,
  defaultLocale: string,
  onRead: (read: VersionRead) => void = () => undefined,
): Promise<void> {
  const now = await readVersion(collection, slug, locale)
  onRead(now)
  refuseUnlessMissing(now.state, locale, slug)
  const { fields, body, metadata } = await fetchContent(collection, slug, defaultLocale)
  await createContentItem(collection, { slug, fields, body, metadata, locale })
}

export interface LocaleVersions {
  /** Each locale's version state; null while they are read */
  states: ReadonlyMap<string, VersionState> | null
  /** The status of each locale's version that exists (§2 status model); null while they are read */
  statuses: ReadonlyMap<string, DocumentStatus> | null
  /**
   * Create the document's version in a locale, copied from the default
   * locale's. Read again first: a version created meanwhile, or one that
   * cannot be checked, is refused rather than overwritten.
   */
  create: (locale: string) => Promise<void>
}

/** Each locale's version as read; null while they are read */
type Reads = ReadonlyMap<string, VersionRead> | null

/** The versions read into the two maps the callers use */
function split(reads: Reads): Pick<LocaleVersions, 'states' | 'statuses'> {
  if (!reads) return { states: null, statuses: null }
  const entries = [...reads]
  return {
    states: new Map(entries.map(([locale, read]) => [locale, read.state])),
    statuses: new Map(
      entries.flatMap(([locale, read]) => (read.status ? [[locale, read.status] as const] : [])),
    ),
  }
}

/** Which of the site's locales a document exists in, and creating a missing one */
export function useLocaleVersions(
  collection: string,
  slug: string,
  locales: readonly string[],
  defaultLocale: string,
): LocaleVersions {
  const [reads, setReads] = useState<Reads>(null)
  const key = locales.join(',')
  const remember = useCallback((locale: string, read: VersionRead) => {
    setReads((current) => new Map([...(current ?? []), [locale, read]]))
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands for the locales
  useEffect(() => {
    // Another document's states never show while this one's are read
    setReads(null)
    if (locales.length < 2) return
    let active = true
    Promise.all(locales.map((locale) => readVersion(collection, slug, locale))).then((found) => {
      if (!active) return
      const unknown: VersionRead = { state: 'unknown', status: null }
      const read = locales.map((locale, i): [string, VersionRead] => [locale, found[i] ?? unknown])
      // A version created while they were read is newer than the read
      setReads((current) => new Map([...read, ...(current ?? [])]))
    })
    return () => {
      active = false
    }
  }, [collection, slug, key])

  const create = useCallback(
    async (locale: string): Promise<void> => {
      await createLocaleVersion(collection, slug, locale, defaultLocale, (read) =>
        remember(locale, read),
      )
      remember(locale, { state: 'exists', status: 'draft' })
    },
    [collection, slug, defaultLocale, remember],
  )
  const views = useMemo(() => split(reads), [reads])
  return { ...views, create }
}
