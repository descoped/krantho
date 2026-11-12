import { FolderInput, X } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { type MediaFolder, type MediaItem, moveMediaToFolder } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { useToast } from '../ui/toast.js'
import { filesText } from './media-model.js'

/** Files uploaded while a folder was shown: the upload takes no folder, so they are in none */
export interface UploadedOutside {
  items: MediaItem[]
  folder: MediaFolder
}

/** Where the upload went, in words: it is in All files, and can be moved to the shown folder */
export function uploadedOutsideText({ items, folder }: UploadedOutside): string {
  const one = items.length === 1
  return `Uploaded ${filesText(items.length)} to All files: an upload goes into no folder. Move ${one ? 'it' : 'them'} to ${folder.name} from ${one ? 'its' : 'their'} details, or with Move here.`
}

/** Move every uploaded file into the folder, one at a time; the count that moved */
async function moveAll(items: readonly MediaItem[], folder: MediaFolder): Promise<number> {
  let moved = 0
  for (const item of items) {
    await moveMediaToFolder(item.id, folder.id)
    moved++
  }
  return moved
}

export interface UploadNoticeProps {
  notice: UploadedOutside
  onMoved: () => void
  onDismiss: () => void
}

/** Says where an upload in a folder view went, with Move here (`PUT /api/media/:id/move`) */
export function UploadNotice({ notice, onMoved, onDismiss }: UploadNoticeProps): ReactElement {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function move(): Promise<void> {
    setBusy(true)
    try {
      const moved = await moveAll(notice.items, notice.folder)
      toast({ text: `Moved ${filesText(moved)} to ${notice.folder.name}.` })
      onMoved()
    } catch (err: unknown) {
      toast({ text: errorMessage(err, 'The files could not be moved'), tone: 'error' })
      setBusy(false)
    }
  }
  return (
    <div className="media-upload-notice" role="status">
      <p>{uploadedOutsideText(notice)}</p>
      <div className="media-actions">
        <Button
          size="sm"
          variant="primary"
          icon={FolderInput}
          aria-disabled={busy}
          onClick={busy ? undefined : () => void move()}
        >
          {busy ? 'Moving…' : 'Move here'}
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
