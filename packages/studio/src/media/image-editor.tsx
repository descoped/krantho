import { ArrowLeft, RotateCcw, Save } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, type ReactElement, useRef, useState } from 'react'
import ReactCrop from 'react-image-crop'
import { Link, useNavigate, useParams } from 'react-router'
import 'react-image-crop/dist/ReactCrop.css'
import { ActionButton } from '../editor/action-button.js'
import type { MediaHotspot, MediaItem } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { mediaStableUrl } from '../lib/media-urls.js'
import { Button, buttonClass } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import {
  ASPECT_OPTIONS,
  hotspotAt,
  nudgeHotspot,
  PREVIEW_ASPECTS,
  previewSrc,
} from './image-editor-model.js'
import { isImage, READ_ONLY_REASON } from './media-model.js'
import { type ImageEditor, useImageEditor } from './use-image-editor.js'
import './image-editor.css'

/** The hotspot's ring over the image */
function HotspotMark({ hotspot }: { hotspot: MediaHotspot }): ReactElement {
  return (
    <span
      className="image-editor-hotspot-mark"
      aria-hidden="true"
      style={{
        left: `${hotspot.x}%`,
        top: `${hotspot.y}%`,
        width: `${hotspot.width}%`,
        height: `${hotspot.height}%`,
      }}
    />
  )
}

/**
 * The image as a button: a click places the hotspot where it lands, arrow
 * keys move it (Enter or Space places it in the centre when there is none)
 */
function HotspotCanvas({ item, editor }: { item: MediaItem; editor: ImageEditor }): ReactElement {
  const { hotspot } = editor
  function place(event: MouseEvent<HTMLButtonElement>): void {
    // A click from the keyboard has no position: it places a missing hotspot in the centre
    if (event.detail === 0) {
      if (!hotspot) editor.setHotspot(hotspotAt(50, 50))
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    editor.setHotspot(
      hotspotAt(
        ((event.clientX - box.left) / box.width) * 100,
        ((event.clientY - box.top) / box.height) * 100,
      ),
    )
  }
  function nudge(event: KeyboardEvent<HTMLButtonElement>): void {
    const next = nudgeHotspot(hotspot, event.key)
    if (!next) return
    event.preventDefault()
    editor.setHotspot(next)
  }
  return (
    <button
      type="button"
      className="image-editor-hotspot"
      disabled={editor.readOnly}
      aria-label="Place the hotspot: click the image, or use the arrow keys"
      onClick={place}
      onKeyDown={nudge}
    >
      <img src={mediaStableUrl(item.id)} alt="" />
      {hotspot && <HotspotMark hotspot={hotspot} />}
    </button>
  )
}

function CropCanvas({ item, editor }: { item: MediaItem; editor: ImageEditor }): ReactElement {
  return (
    <ReactCrop
      {...(editor.crop ? { crop: editor.crop } : {})}
      {...(editor.aspect ? { aspect: editor.aspect } : {})}
      disabled={editor.readOnly}
      onChange={(_, percent) => editor.setCrop(percent)}
    >
      <img src={mediaStableUrl(item.id)} alt={item.altText} />
    </ReactCrop>
  )
}

/** A row of toggle buttons, one pressed */
function Toggles<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}): ReactElement {
  return (
    <fieldset className="image-editor-toggles">
      <legend className="image-editor-legend">{label}</legend>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          className="image-editor-toggle"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  )
}

const TOOLS = [
  { label: 'Crop', value: 'crop' },
  { label: 'Hotspot', value: 'hotspot' },
] as const

function HotspotNote({ editor }: { editor: ImageEditor }): ReactElement {
  const { hotspot } = editor
  return (
    <p className="image-editor-note">
      {hotspot
        ? `Hotspot at ${Math.round(hotspot.x)}%, ${Math.round(hotspot.y)}%. Click or use the arrow keys to move it.`
        : 'No hotspot: click the image, or focus it and press an arrow key.'}
      {hotspot && (
        <Button size="sm" variant="ghost" onClick={() => editor.setHotspot(null)}>
          Clear hotspot
        </Button>
      )}
    </p>
  )
}

/** The tool, then its settings: aspect ratios for Crop, the hotspot's place for Hotspot */
function Toolbar({ editor }: { editor: ImageEditor }): ReactElement {
  return (
    <div className="image-editor-toolbar">
      <Toggles label="Tool" options={TOOLS} value={editor.tool} onChange={editor.setTool} />
      {editor.tool === 'crop' ? (
        <Toggles
          label="Aspect ratio"
          options={ASPECT_OPTIONS}
          value={editor.aspect}
          onChange={editor.setAspect}
        />
      ) : (
        <HotspotNote editor={editor} />
      )}
    </div>
  )
}

/** How the saved crop and hotspot frame the image at each aspect ratio */
function PreviewStrip({ item, version }: { item: MediaItem; version: number }): ReactElement {
  return (
    <section className="image-editor-previews" aria-labelledby="image-editor-previews">
      <h2 id="image-editor-previews" className="image-editor-subtitle">
        Saved framing at each aspect ratio
      </h2>
      <p className="image-editor-note">
        {item.hotspot
          ? 'The hotspot guides where each crop centres.'
          : 'Set a hotspot to control where each crop centres.'}
      </p>
      <ul className="image-editor-strip">
        {PREVIEW_ASPECTS.map((preview) => (
          <li key={preview.label}>
            <img
              src={previewSrc(item.id, preview.aspect, version)}
              alt={`${preview.label} framing`}
            />
            <span>{preview.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Leave with unsaved changes only once confirmed */
function DiscardModal({
  onStay,
  onLeave,
}: {
  onStay: () => void
  onLeave: () => void
}): ReactElement {
  const safe = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      title="Discard changes"
      onClose={onStay}
      initialFocus={safe}
      actions={
        <>
          <Button ref={safe} onClick={onStay}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Discard
          </Button>
        </>
      }
    >
      <p>The crop and hotspot you drew are not saved. Leave without saving them?</p>
    </Modal>
  )
}

/** Reset and Save; read-only, they stay focusable and say why */
function SaveActions({ editor }: { editor: ImageEditor }): ReactElement {
  const reason = editor.readOnly ? READ_ONLY_REASON : editor.busy ? 'Saving…' : null
  return (
    <>
      <ActionButton icon={RotateCcw} reason={reason} onClick={() => void editor.reset()}>
        Reset
      </ActionButton>
      <ActionButton
        variant="primary"
        icon={Save}
        reason={reason ?? (editor.dirty ? null : 'Nothing has changed since the last save.')}
        onClick={() => void editor.save()}
      >
        {editor.busy ? 'Saving…' : 'Save'}
      </ActionButton>
    </>
  )
}

function Header({ item, editor }: { item: MediaItem; editor: ImageEditor }): ReactElement {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  return (
    <header className="image-editor-header">
      <h1 className="image-editor-title">Crop & hotspot · {item.filename}</h1>
      <div className="image-editor-actions">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => (editor.dirty ? setLeaving(true) : navigate('/media'))}
        >
          Back to Media
        </Button>
        <SaveActions editor={editor} />
      </div>
      {editor.readOnly && (
        <p className="image-editor-note" role="note">
          {READ_ONLY_REASON} The crop and hotspot are shown as saved.
        </p>
      )}
      {leaving && (
        <DiscardModal onStay={() => setLeaving(false)} onLeave={() => navigate('/media')} />
      )}
    </header>
  )
}

function Editing({ item, editor }: { item: MediaItem; editor: ImageEditor }): ReactElement {
  if (!isImage(item)) {
    return (
      <p className="image-editor-note">
        This file is not an image: only images have a crop and a hotspot.
      </p>
    )
  }
  return (
    <>
      <div className="image-editor-canvas">
        {editor.tool === 'crop' ? (
          <CropCanvas item={item} editor={editor} />
        ) : (
          <HotspotCanvas item={item} editor={editor} />
        )}
      </div>
      <Toolbar editor={editor} />
      <PreviewStrip item={item} version={editor.version} />
    </>
  )
}

/** The image editor at `/media/:id/edit`: crop and hotspot, saved on the media file */
export function ImageEditorPage(): ReactElement {
  const { id = '' } = useParams<{ id: string }>()
  const { hasRole } = useAuth()
  const editor = useImageEditor(id, !hasRole('editor'))
  const { loaded } = editor
  if (loaded.state === 'loading') return <p role="status">Reading the image…</p>
  if (loaded.state === 'missing') {
    return (
      <div className="image-editor">
        <p role="alert">{loaded.message}</p>
        <Link to="/media" className={buttonClass('secondary', 'sm')}>
          Back to Media
        </Link>
      </div>
    )
  }
  return (
    <div className="image-editor">
      <Header item={loaded.item} editor={editor} />
      <Editing item={loaded.item} editor={editor} />
    </div>
  )
}
