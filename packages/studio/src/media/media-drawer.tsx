import { FileImage, X } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'
import type { MediaFolder, MediaItem } from '../lib/api.js'
import { formatDateTime, formatSize } from '../lib/format.js'
import { mediaPreviewUrl, mediaStableUrl } from '../lib/media-urls.js'
import { editorPath } from '../lib/paths.js'
import { IconButton } from '../ui/button.js'
import { DrawerActions, FileReferences } from './drawer-actions.js'
import { DrawerDetails } from './drawer-details.js'
import {
  dimensionsText,
  isImage,
  kindLabel,
  type MediaPermissions,
  type References,
  referenceText,
} from './media-model.js'
import './media-drawer.css'

/** The documents that use the file, each a link to its editor */
function ReferenceList({ references }: { references: References | undefined }): ReactElement {
  return (
    <div className="media-references">
      <p className="media-references-count">{referenceText(references)}</p>
      {references?.state === 'ready' && references.documents.length > 0 && (
        <ul className="media-reference-list">
          {references.documents.map((doc) => (
            <li key={`${doc.collection}/${doc.slug}`}>
              <Link to={editorPath(doc.collection, doc.slug)} className="media-link">
                {doc.collection}/{doc.slug}
              </Link>{' '}
              <span className="media-reference-fields">({doc.fields.join(', ')})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Preview, then the facts the API keeps: kind, dimensions, size, upload time and the stable URL */
function Facts({ item }: { item: MediaItem }): ReactElement {
  return (
    <>
      <div className="media-drawer-preview">
        {isImage(item) ? (
          <img src={mediaPreviewUrl(item, 'lg')} alt={item.altText} />
        ) : (
          <FileImage aria-hidden="true" />
        )}
      </div>
      <dl className="media-facts">
        <dt>Kind</dt>
        <dd>{kindLabel(item.mimeType)}</dd>
        <dt>Dimensions</dt>
        <dd>{dimensionsText(item) ?? 'None stored'}</dd>
        <dt>Size</dt>
        <dd>{formatSize(item.size)}</dd>
        <dt>Uploaded</dt>
        <dd>
          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
        </dd>
        <dt>Stable URL</dt>
        <dd>
          <code className="media-url">{mediaStableUrl(item.id)}</code>
        </dd>
      </dl>
    </>
  )
}

export interface MediaDrawerProps {
  item: MediaItem
  references: References | undefined
  /** null when the site has no folders */
  folders: readonly MediaFolder[] | null
  knownTags: readonly string[]
  permissions: MediaPermissions
  onClose: () => void
  /** The file changed: saved, moved or replaced */
  onChanged: (item: MediaItem, replaced: boolean) => void
  onDuplicated: (copy: MediaItem) => void
  onDelete: () => void
}

/** The file's name as the drawer's heading, which takes focus when it opens, and Close */
function DrawerHead({
  titleId,
  item,
  onClose,
}: {
  titleId: string
  item: MediaItem
  onClose: () => void
}): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null)
  // Keyed by the file in the page, so it opens anew — and takes focus — for each file
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <div className="media-drawer-head">
      <h2 id={titleId} ref={heading} tabIndex={-1} className="media-drawer-title">
        {item.filename}
      </h2>
      <IconButton icon={X} label="Close details" onClick={onClose} />
    </div>
  )
}

/**
 * The open file's details, beside the grid: a region labelled by the file's
 * name, focused on its heading when it opens; Esc or Close closes it
 */
export function MediaDrawer(props: MediaDrawerProps): ReactElement {
  const { item, permissions } = props
  const titleId = useId()
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.stopPropagation()
    props.onClose()
  }
  return (
    <section className="media-drawer" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <DrawerHead titleId={titleId} item={item} onClose={props.onClose} />
      <Facts item={item} />
      <ReferenceList references={props.references} />
      <FileReferences item={item} />
      <DrawerActions
        item={item}
        canEdit={permissions.canEdit}
        onReplaced={(replaced) => props.onChanged(replaced, true)}
        onDuplicated={props.onDuplicated}
        onDelete={props.onDelete}
      />
      <DrawerDetails
        key={`${item.id}:${item.url}`}
        item={item}
        references={props.references}
        folders={props.folders}
        knownTags={props.knownTags}
        canEdit={permissions.canEdit}
        onSaved={(saved) => props.onChanged(saved, false)}
      />
    </section>
  )
}
