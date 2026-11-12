import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMedia,
  fetchMediaFolders,
  fetchMediaInfo,
  fetchMediaTags,
  type MediaFolder,
  type MediaInfo,
  type MediaItem,
} from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { PAGE_SIZE, type SortOption, sortItems } from './media-model.js'

/** What the grid is filtered by */
export interface MediaFilters {
  search: string
  tag: string
  /** The folder whose files are shown; null for every file */
  folder: string | null
  page: number
}

const NO_FILTERS: MediaFilters = { search: '', tag: '', folder: null, page: 0 }

/** One page of files, as `GET /api/media` answers it */
interface Listing {
  items: MediaItem[]
  total: number
}

/** What the store and its folders hold: totals, tags, folders and each folder's file count */
interface Library {
  /** False until the library is first read */
  read: boolean
  /** null when unread, or when the store's info could not be read */
  info: MediaInfo | null
  tags: string[]
  folders: MediaFolder[]
  /** Files directly in each folder, by id — the API's list total for that folder */
  folderCounts: ReadonlyMap<string, number>
}

const EMPTY_LIBRARY: Library = {
  read: false,
  info: null,
  tags: [],
  folders: [],
  folderCounts: new Map(),
}

export interface MediaLibrary {
  filters: MediaFilters
  /** Change filters; any change but the page goes back to the first page */
  setFilters: (change: Partial<MediaFilters>) => void
  sort: SortOption
  setSort: (sort: SortOption) => void
  /** null until the first page is read */
  listing: Listing | null
  items: MediaItem[]
  pageCount: number
  library: Library
  error: string | null
  reload: () => void
}

/** Each folder's count, from the library's figures; none when they could not be read */
function countFolders(
  folders: readonly MediaFolder[],
  info: MediaInfo | null,
): Map<string, number> {
  if (!info) return new Map()
  return new Map(folders.map((folder) => [folder.id, info.folderCounts[folder.id] ?? 0]))
}

async function readLibrary(hasFolders: boolean): Promise<Library> {
  const [info, tags, folders] = await Promise.all([
    fetchMediaInfo().catch(() => null),
    fetchMediaTags().catch(() => []),
    hasFolders ? fetchMediaFolders().catch(() => []) : Promise.resolve([]),
  ])
  return { read: true, info, tags, folders, folderCounts: countFolders(folders, info) }
}

function readPage(filters: MediaFilters): Promise<Listing> {
  return fetchMedia({
    limit: PAGE_SIZE,
    offset: filters.page * PAGE_SIZE,
    search: filters.search || undefined,
    tag: filters.tag || undefined,
    folder: filters.folder ?? undefined,
  })
}

/** The page of files the filters select, read again whenever they or the library change */
function useListing(filters: MediaFilters, version: number): [Listing | null, string | null] {
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    // `version` changes after every write, so the page is read again
    void version
    readPage(filters)
      .then((next) => {
        if (!active) return
        setListing(next)
        setError(null)
      })
      .catch((err: unknown) => active && setError(errorMessage(err, 'Media could not be read')))
    return () => {
      active = false
    }
  }, [filters, version])
  return [listing, error]
}

function useLibrary(hasFolders: boolean, version: number): Library {
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY)
  useEffect(() => {
    let active = true
    void version
    void readLibrary(hasFolders).then((next) => active && setLibrary(next))
    return () => {
      active = false
    }
  }, [hasFolders, version])
  return library
}

/** The Media destination's data: the filtered page of files, the store's totals and folders */
export function useMediaLibrary(hasFolders: boolean): MediaLibrary {
  const [filters, setFilterState] = useState<MediaFilters>(NO_FILTERS)
  const [sort, setSort] = useState<SortOption>('newest')
  const [version, setVersion] = useState(0)
  const [listing, error] = useListing(filters, version)
  const library = useLibrary(hasFolders, version)
  const setFilters = useCallback((change: Partial<MediaFilters>) => {
    setFilterState((current) => ({ ...current, page: 0, ...change }))
  }, [])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const items = useMemo(() => sortItems(listing?.items ?? [], sort), [listing, sort])
  const pageCount = Math.ceil((listing?.total ?? 0) / PAGE_SIZE)
  return { filters, setFilters, sort, setSort, listing, items, pageCount, library, error, reload }
}
