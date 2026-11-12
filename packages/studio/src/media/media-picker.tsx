import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/use-focus-trap.js'
import { fetchMedia, type MediaItem } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { errorMessage } from '../lib/fetch.js'
import { mediaPreviewUrl } from '../lib/media-urls.js'
import { Button } from '../ui/button.js'
import { DropZone } from './drop-zone.js'
import { READ_ONLY_REASON } from './media-model.js'
import { MediaPages } from './media-pages.js'
import './media-picker.css'

const PICKER_PAGE_SIZE = 20

type Library =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; items: MediaItem[]; total: number }

/** One page of the library at a time */
function useLibraryPage(page: number): Library {
  const [library, setLibrary] = useState<Library>({ state: 'loading' })
  useEffect(() => {
    let active = true
    setLibrary({ state: 'loading' })
    fetchMedia({ limit: PICKER_PAGE_SIZE, offset: page * PICKER_PAGE_SIZE })
      .then((result) => active && setLibrary({ state: 'ready', ...result }))
      .catch(
        (err: unknown) =>
          active &&
          setLibrary({ state: 'failed', message: errorMessage(err, 'Media could not be read') }),
      )
    return () => {
      active = false
    }
  }, [page])
  return library
}

/** The library's files, each a button that chooses it */
function PickerGrid({
  library,
  onSelect,
}: {
  library: Library
  onSelect: (item: MediaItem) => void
}): ReactElement {
  if (library.state === 'loading') return <p role="status">Loading media…</p>
  if (library.state === 'failed') return <p role="alert">{library.message}</p>
  if (library.items.length === 0) return <p>No media yet. Upload an image above.</p>
  return (
    <ul className="media-picker-grid" aria-label="Library">
      {library.items.map((item) => (
        <li key={item.id}>
          <button type="button" className="media-picker-file" onClick={() => onSelect(item)}>
            <img src={mediaPreviewUrl(item, 'sm')} alt="" />
            <span className="media-picker-name">{item.filename}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface PickerModalProps {
  onSelect: (item: MediaItem) => void
  onUpload: (item: MediaItem) => void
  onClose: () => void
}

/** Upload, the library a page at a time, and Cancel */
function PickerBody({ onSelect, onUpload, onClose }: PickerModalProps): ReactElement {
  const [page, setPage] = useState(0)
  const library = useLibraryPage(page)
  const { hasRole } = useAuth()
  const pages = library.state === 'ready' ? Math.ceil(library.total / PICKER_PAGE_SIZE) : 0
  return (
    <>
      <DropZone
        multiple={false}
        blocked={hasRole('editor') ? null : READ_ONLY_REASON}
        onUploaded={([item]) => item && onUpload(item)}
      />
      <PickerGrid library={library} onSelect={onSelect} />
      <MediaPages page={page} count={pages} onPage={setPage} />
      <div className="media-picker-actions">
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </>
  )
}

/** Choose a media file from the library, or upload one */
export function MediaPickerModal(props: PickerModalProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Keyboard users choose from the library too: focus stays inside, Esc closes
  useFocusTrap(dialogRef, true)
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    props.onClose()
  }
  // In the page's body, outside any form that may be disabled under it
  return createPortal(
    <div className="media-picker-layer">
      <div className="media-picker-scrim" aria-hidden="true" onClick={props.onClose} />
      <div
        ref={dialogRef}
        className="media-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="media-picker-title">
          Choose an image
        </h2>
        <PickerBody {...props} />
      </div>
    </div>,
    document.body,
  )
}
