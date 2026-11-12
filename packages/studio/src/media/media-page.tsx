import { ImageOff } from 'lucide-react'
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { type MediaItem, moveMediaToFolder } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { errorMessage } from '../lib/fetch.js'
import { EmptyState } from '../ui/empty-state.js'
import { useToast } from '../ui/toast.js'
import { DeleteModal } from './delete-modal.js'
import { DropZone } from './drop-zone.js'
import { MediaDrawer } from './media-drawer.js'
import { MediaFolders } from './media-folders.js'
import { MediaGrid } from './media-grid.js'
import { MediaHeader } from './media-header.js'
import { type MediaPermissions, mediaPermissions, READ_ONLY_REASON } from './media-model.js'
import { MediaPages } from './media-pages.js'
import { MediaToolbar } from './media-toolbar.js'
import { SelectionBar } from './selection-bar.js'
import { type UploadedOutside, UploadNotice } from './upload-notice.js'
import { type MediaLibrary, useMediaLibrary } from './use-media-library.js'
import { type OpenFile, type Selection, useOpenFile, useSelection } from './use-media-page.js'
import { type ReferenceBook, useReferences } from './use-references.js'
import './media.css'

/**
 * After a dialog closes, focus returns to where it was — unless that control
 * went with what was deleted: then focus goes to the page's content, never the body
 */
function keepFocusInPage(): void {
  setTimeout(() => {
    if (document.activeElement === document.body || !document.activeElement) {
      document.getElementById('studio-main')?.focus()
    }
  }, 0)
}

/** Everything the page's parts share */
interface Page {
  media: MediaLibrary
  references: ReferenceBook
  open: OpenFile
  selection: Selection
  permissions: MediaPermissions
  hasFolders: boolean
  /** Ask to delete files */
  askDelete: (items: MediaItem[]) => void
}

/** The grid, or why there is nothing in it */
function Files({ page }: { page: Page }): ReactElement {
  const { media, selection, open } = page
  if (media.error) return <p role="alert">{media.error}</p>
  if (!media.listing) return <p role="status">Reading media…</p>
  if (media.items.length === 0) {
    const filtered = media.filters.search || media.filters.tag || media.filters.folder
    return (
      <EmptyState icon={ImageOff} title={filtered ? 'No files match' : 'No media yet'}>
        {filtered
          ? 'Nothing here matches the search, tag and folder chosen.'
          : 'Upload an image to start the library.'}
      </EmptyState>
    )
  }
  return (
    <MediaGrid
      items={media.items}
      references={page.references.of}
      bulk={selection.on}
      selected={selection.ids}
      onToggle={(id) => {
        const item = media.items.find((candidate) => candidate.id === id)
        if (item) selection.toggle(item)
      }}
      open={open.item?.id ?? null}
      onOpen={open.open}
      draggable={page.hasFolders && page.permissions.canEdit}
    />
  )
}

/** Drop a tile on a folder: the file moves there */
function useMoveToFolder(reload: () => void): (mediaId: string, folder: string | null) => void {
  const toast = useToast()
  return (mediaId, folder) => {
    moveMediaToFolder(mediaId, folder)
      .then(() => {
        toast({ text: 'Moved.' })
        reload()
      })
      .catch((err: unknown) =>
        toast({ text: errorMessage(err, 'The file could not be moved'), tone: 'error' }),
      )
  }
}

/** The folder list, when the site has folders; a folder that is gone stops filtering */
function Folders({ page }: { page: Page }): ReactElement | null {
  const { media } = page
  const { library, filters, setFilters, reload } = media
  const move = useMoveToFolder(reload)
  // Checked when the library is read again, so a folder chosen before that read
  // (one just created) is not taken for one that is gone
  const shown = useRef(filters.folder)
  shown.current = filters.folder
  useEffect(() => {
    const folder = shown.current
    if (!library.read || folder === null) return
    if (!library.folders.some((candidate) => candidate.id === folder)) setFilters({ folder: null })
  }, [library, setFilters])
  if (!page.hasFolders) return null
  return (
    <MediaFolders
      folders={library.folders}
      counts={library.folderCounts}
      total={library.info?.totalItems ?? null}
      selected={filters.folder}
      onSelect={(folder) => setFilters({ folder })}
      permissions={page.permissions}
      onChanged={(created) => {
        reload()
        if (created) setFilters({ folder: created })
      }}
      onMove={move}
    />
  )
}

/**
 * The drop zone, and — after an upload while a folder is shown — where the
 * files went (the upload takes no folder) with Move here
 */
function Upload({ page }: { page: Page }): ReactElement {
  const { media, permissions } = page
  const [outside, setOutside] = useState<UploadedOutside | null>(null)
  function uploaded(items: MediaItem[]): void {
    const folder = media.library.folders.find((candidate) => candidate.id === media.filters.folder)
    setOutside(folder ? { items, folder } : null)
    media.setFilters({ page: 0 })
    media.reload()
  }
  return (
    <>
      <DropZone blocked={permissions.canEdit ? null : READ_ONLY_REASON} onUploaded={uploaded} />
      {outside && (
        <UploadNotice
          notice={outside}
          onDismiss={() => setOutside(null)}
          onMoved={() => {
            setOutside(null)
            media.reload()
          }}
        />
      )}
    </>
  )
}

/** Upload, the toolbar, the selection bar, the files and the pages */
function Library({ page }: { page: Page }): ReactElement {
  const { media, selection, permissions } = page
  return (
    <div className="media-main">
      <Upload page={page} />
      <MediaToolbar
        filters={media.filters}
        onFilters={media.setFilters}
        tags={media.library.tags}
        sort={media.sort}
        onSort={media.setSort}
        bulk={selection.on}
        onBulk={selection.toggleMode}
      />
      {selection.on && (
        <SelectionBar
          count={selection.ids.size}
          canDelete={permissions.canAdminister}
          onDelete={() => page.askDelete(selection.items)}
          onSelectPage={() => selection.add(media.items)}
          onClear={selection.clear}
        />
      )}
      <Files page={page} />
      <MediaPages
        page={media.filters.page}
        count={media.pageCount}
        onPage={(next) => media.setFilters({ page: next })}
      />
    </div>
  )
}

/** The open file's drawer, wired to the library */
function Drawer({ page }: { page: Page }): ReactElement | null {
  const { media, open } = page
  const item = open.item
  if (!item) return null
  return (
    <MediaDrawer
      key={item.id}
      item={item}
      references={page.references.of(item.id)}
      folders={page.hasFolders ? media.library.folders : null}
      knownTags={media.library.tags}
      permissions={page.permissions}
      onClose={open.close}
      onChanged={(changed) => {
        open.update(changed)
        media.reload()
      }}
      onDuplicated={(copy) => {
        media.reload()
        open.open(copy)
      }}
      onDelete={() => page.askDelete([item])}
    />
  )
}

/** The delete confirmation, wired to the library and the open file */
function Deleting({
  page,
  items,
  onClose,
}: {
  page: Page
  items: MediaItem[]
  onClose: () => void
}): ReactElement {
  const { open, selection, media } = page
  return (
    <DeleteModal
      items={items}
      references={page.references.of}
      onClose={() => {
        onClose()
        keepFocusInPage()
      }}
      onDone={(deleted) => {
        if (open.item && deleted.includes(open.item.id)) open.drop()
        selection.remove(deleted)
        media.reload()
      }}
    />
  )
}

/** Media: the store's files, in folders, with upload, search, bulk delete and each file's details */
export function MediaPage(): ReactElement {
  const { hasRole } = useAuth()
  const hasFolders = isEnabled(useCapabilities(), 'mediaFolders')
  const media = useMediaLibrary(hasFolders)
  const ids = useMemo(() => media.items.map((item) => item.id), [media.items])
  const references = useReferences(ids)
  const open = useOpenFile(media.items)
  const selection = useSelection()
  const [deleting, setDeleting] = useState<MediaItem[] | null>(null)
  const page: Page = {
    media,
    references,
    open,
    selection,
    permissions: mediaPermissions(hasRole),
    hasFolders,
    // The references are read again, so the warning counts a use made since the page loaded
    askDelete: (items) => {
      for (const item of items) references.refresh(item.id)
      setDeleting(items)
    },
  }
  return (
    <div className={`media${open.item ? ' media--drawer' : ''}`}>
      <MediaHeader info={media.library.info} read={media.library.read} />
      <div className="media-body">
        <Folders page={page} />
        <Library page={page} />
      </div>
      <Drawer page={page} />
      {deleting && <Deleting page={page} items={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}
