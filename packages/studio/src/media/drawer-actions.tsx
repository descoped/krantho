import { Copy, CopyPlus, Crop, ExternalLink, Hash, ImageUp, Trash2 } from 'lucide-react'
import { type ReactElement, useRef } from 'react'
import { Link } from 'react-router'
import { ActionButton } from '../editor/action-button.js'
import type { MediaItem } from '../lib/api.js'
import { safeHref } from '../lib/guards.js'
import { mediaMarkdown } from '../lib/media-urls.js'
import { mediaEditPath } from '../lib/paths.js'
import { Button, buttonClass } from '../ui/button.js'
import { isImage, READ_ONLY_REASON } from './media-model.js'
import { useCopy, useDuplicate, useReplace } from './use-drawer-actions.js'

export interface DrawerActionsProps {
  item: MediaItem
  canEdit: boolean
  /** The file changed behind its id (a replace) */
  onReplaced: (item: MediaItem) => void
  onDuplicated: (copy: MediaItem) => void
  onDelete: () => void
}

/** Crop & hotspot in the image editor; read-only, it stays focusable and says why */
function CropLink({ item, canEdit }: { item: MediaItem; canEdit: boolean }): ReactElement {
  if (!canEdit) {
    return (
      <ActionButton size="sm" icon={Crop} reason={READ_ONLY_REASON} onClick={() => undefined}>
        Crop & hotspot
      </ActionButton>
    )
  }
  return (
    <Link to={mediaEditPath(item.id)} className={buttonClass('secondary', 'sm')}>
      <Crop className="ui-button-icon" aria-hidden="true" />
      Crop & hotspot
    </Link>
  )
}

/** Replace the file behind the id with one chosen from disk */
function ReplaceButton({
  item,
  reason,
  onReplaced,
}: {
  item: MediaItem
  reason: string | null
  onReplaced: (item: MediaItem) => void
}): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const replace = useReplace(item, onReplaced)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={`Replace ${item.filename}`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void replace.run(file)
        }}
      />
      <ActionButton
        size="sm"
        icon={ImageUp}
        reason={reason ?? (replace.busy ? 'Replacing…' : null)}
        onClick={() => input.current?.click()}
      >
        {replace.busy ? 'Replacing…' : 'Replace'}
      </ActionButton>
    </>
  )
}

/** Copy markdown (images), Copy ID and Open original: what a file is known by */
export function FileReferences({ item }: { item: MediaItem }): ReactElement {
  const copy = useCopy()
  const original = safeHref(item.url)
  return (
    <div className="media-actions">
      {isImage(item) && (
        <Button size="sm" icon={Copy} onClick={() => copy(mediaMarkdown(item), 'Markdown')}>
          Copy markdown
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={Hash} onClick={() => copy(item.id, 'ID')}>
        Copy ID
      </Button>
      {original && (
        <a
          href={original}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass('ghost', 'sm')}
        >
          <ExternalLink className="ui-button-icon" aria-hidden="true" />
          Open original
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}

/** Crop & hotspot, Replace (keeps the id), Duplicate and Delete */
export function DrawerActions(props: DrawerActionsProps): ReactElement {
  const { item, canEdit } = props
  const reason = canEdit ? null : READ_ONLY_REASON
  const duplicate = useDuplicate(item, props.onDuplicated)
  return (
    <div className="media-actions">
      {isImage(item) && <CropLink item={item} canEdit={canEdit} />}
      <ReplaceButton item={item} reason={reason} onReplaced={props.onReplaced} />
      <ActionButton
        size="sm"
        icon={CopyPlus}
        reason={reason ?? (duplicate.busy ? 'Duplicating…' : null)}
        onClick={() => void duplicate.run()}
      >
        Duplicate
      </ActionButton>
      <ActionButton
        size="sm"
        variant="danger"
        icon={Trash2}
        reason={reason}
        onClick={props.onDelete}
      >
        Delete
      </ActionButton>
    </div>
  )
}
