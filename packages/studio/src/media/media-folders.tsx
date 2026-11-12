import { ChevronDown, ChevronRight, Folder, Layers, type LucideIcon } from 'lucide-react'
import { type DragEvent, type ReactElement, useState } from 'react'
import type { MediaFolder } from '../lib/api.js'
import { FolderActions } from './folder-actions.js'
import {
  type FolderRow,
  folderRows,
  MEDIA_DRAG_TYPE,
  type MediaPermissions,
} from './media-model.js'
import './media-folders.css'

export interface MediaFoldersProps {
  folders: readonly MediaFolder[]
  /** Files directly in each folder, by id, from the API; a folder missing here shows no number */
  counts: ReadonlyMap<string, number>
  /** Every file in the store, from the API; null when unknown */
  total: number | null
  /** The shown folder; null for every file */
  selected: string | null
  onSelect: (folder: string | null) => void
  permissions: MediaPermissions
  onChanged: (created?: string | undefined) => void
  /** A tile was dropped on a folder (null: out of every folder) */
  onMove: (mediaId: string, folder: string | null) => void
}

function Count({ value }: { value: number | null | undefined }): ReactElement | null {
  if (value === null || value === undefined) return null
  return (
    <span className="media-folder-count">
      {value}
      <span className="visually-hidden"> {value === 1 ? 'file' : 'files'}</span>
    </span>
  )
}

interface FolderButtonProps {
  label: string
  count: number | null | undefined
  pressed: boolean
  icon: LucideIcon
  onSelect: () => void
  onDropMedia: (mediaId: string) => void
}

/** A folder to filter by, and a place to drop a tile on */
function FolderButton(props: FolderButtonProps): ReactElement {
  const { icon: Icon } = props
  function drop(event: DragEvent<HTMLButtonElement>): void {
    const id = event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    if (!id) return
    event.preventDefault()
    props.onDropMedia(id)
  }
  return (
    <button
      type="button"
      className="media-folder"
      aria-pressed={props.pressed}
      onClick={props.onSelect}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) event.preventDefault()
      }}
      onDrop={drop}
    >
      <Icon className="media-folder-icon" aria-hidden="true" />
      <span className="media-folder-name">{props.label}</span>
      <Count value={props.count} />
    </button>
  )
}

/** Shows or hides a folder's subfolders */
function Toggle({
  row,
  open,
  onToggle,
}: {
  row: FolderRow
  open: boolean
  onToggle: () => void
}): ReactElement {
  if (!row.hasChildren) return <span className="media-folder-toggle-space" aria-hidden="true" />
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      className="media-folder-toggle"
      aria-expanded={open}
      aria-label={`Subfolders of ${row.folder.name}`}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

/** The folder tree's rows below All files; a collapsed folder hides its subfolders */
function FolderList({ props }: { props: MediaFoldersProps }): ReactElement[] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string): void =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return folderRows(props.folders, collapsed).map((row) => (
    <li
      key={row.folder.id}
      className="media-folder-row"
      style={{ paddingInlineStart: `calc(${row.depth} * var(--space-4))` }}
    >
      <Toggle
        row={row}
        open={!collapsed.has(row.folder.id)}
        onToggle={() => toggle(row.folder.id)}
      />
      <FolderButton
        label={row.folder.name}
        count={props.counts.get(row.folder.id)}
        pressed={props.selected === row.folder.id}
        icon={Folder}
        onSelect={() => props.onSelect(row.folder.id)}
        onDropMedia={(id) => props.onMove(id, row.folder.id)}
      />
    </li>
  ))
}

/** The folders, each with its count from the API, and New folder */
export function MediaFolders(props: MediaFoldersProps): ReactElement {
  const selectedFolder = props.folders.find((folder) => folder.id === props.selected) ?? null
  return (
    <nav className="media-folders" aria-label="Folders">
      <h2 className="media-folders-title">Folders</h2>
      <ul className="media-folder-list">
        <li className="media-folder-row">
          <span className="media-folder-toggle-space" aria-hidden="true" />
          <FolderButton
            label="All files"
            count={props.total}
            pressed={props.selected === null}
            icon={Layers}
            onSelect={() => props.onSelect(null)}
            onDropMedia={(id) => props.onMove(id, null)}
          />
        </li>
        <FolderList props={props} />
      </ul>
      <FolderActions
        selected={selectedFolder}
        canEdit={props.permissions.canEdit}
        canAdminister={props.permissions.canAdminister}
        onChanged={props.onChanged}
      />
    </nav>
  )
}
