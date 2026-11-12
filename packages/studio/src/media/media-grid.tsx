import { FileImage } from 'lucide-react'
import type { ReactElement } from 'react'
import type { MediaItem } from '../lib/api.js'
import { mediaPreviewUrl } from '../lib/media-urls.js'
import {
  dimensionsText,
  isImage,
  kindLabel,
  MEDIA_DRAG_TYPE,
  type References,
  referenceText,
} from './media-model.js'

/** What a tile shows: the thumbnail, the kind badge, the name, the dimensions and the references */
function TileBody({
  item,
  references,
}: {
  item: MediaItem
  references: References | undefined
}): ReactElement {
  return (
    <>
      <span className="media-tile-thumb">
        {isImage(item) ? (
          <img src={mediaPreviewUrl(item, 'md')} alt="" loading="lazy" />
        ) : (
          <FileImage aria-hidden="true" />
        )}
        <span className="media-tile-kind">{kindLabel(item.mimeType)}</span>
      </span>
      <span className="media-tile-name">{item.filename}</span>
      <span className="media-tile-meta">{dimensionsText(item) ?? 'No pixel dimensions'}</span>
      <span className="media-tile-refs">{referenceText(references)}</span>
    </>
  )
}

export interface MediaGridProps {
  items: readonly MediaItem[]
  references: (id: string) => References | undefined
  /** Bulk select: each tile is a checkbox */
  bulk: boolean
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  /** The file whose details are open */
  open: string | null
  onOpen: (item: MediaItem) => void
  /** Tiles can be dragged onto a folder */
  draggable: boolean
}

function Tile({ item, props }: { item: MediaItem; props: MediaGridProps }): ReactElement {
  const references = props.references(item.id)
  if (props.bulk) {
    const checked = props.selected.has(item.id)
    return (
      <label className={`media-tile${checked ? ' media-tile--selected' : ''}`}>
        <input
          type="checkbox"
          className="media-tile-check"
          aria-label={`Select ${item.filename}`}
          checked={checked}
          onChange={() => props.onToggle(item.id)}
        />
        <TileBody item={item} references={references} />
      </label>
    )
  }
  return (
    <button
      type="button"
      className="media-tile"
      data-media-id={item.id}
      aria-pressed={props.open === item.id}
      draggable={props.draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => props.onOpen(item)}
    >
      <TileBody item={item} references={references} />
    </button>
  )
}

/** The files as a list of tiles: each a button that opens its details, or a checkbox in Bulk select */
export function MediaGrid(props: MediaGridProps): ReactElement {
  return (
    <ul className="media-grid" aria-label="Files">
      {props.items.map((item) => (
        <li key={item.id}>
          <Tile item={item} props={props} />
        </li>
      ))}
    </ul>
  )
}
