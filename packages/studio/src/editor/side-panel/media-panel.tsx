import { Crop, ImageUp } from 'lucide-react'
import { type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { fetchMediaItem } from '../../lib/api.js'
import type { MediaItem } from '../../lib/api-types.js'
import { isEnabled, useCapabilities } from '../../lib/capabilities.js'
import { mediaEditPath } from '../../lib/paths.js'
import { useReplace, useSaveAlt } from '../../media/use-drawer-actions.js'
import { Button, buttonClass } from '../../ui/button.js'
import { PanelNote } from './panel-card.js'

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; item: MediaItem }

function useMediaItem(id: string): [Loaded, (item: MediaItem) => void] {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  useEffect(() => {
    let active = true
    setLoaded({ state: 'loading' })
    fetchMediaItem(id)
      .then((item) => active && setLoaded({ state: 'ready', item }))
      .catch(() => active && setLoaded({ state: 'missing' }))
    return () => {
      active = false
    }
  }, [id])
  return [loaded, (item) => setLoaded({ state: 'ready', item })]
}

/** Replace the file behind the id: saved on the media file at once, never in the draft */
function Replace({
  item,
  disabled,
  onReplaced,
}: {
  item: MediaItem
  disabled: boolean
  onReplaced: (item: MediaItem) => void
}): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const { busy, run: replace } = useReplace(item, onReplaced)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void replace(file)
        }}
      />
      <Button
        size="sm"
        icon={ImageUp}
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Replacing…' : 'Replace'}
      </Button>
    </>
  )
}

/**
 * The alt text, saved on the media file — for every page that uses it, not in
 * this draft. It shows the file's alt text as last saved or replaced; with
 * nothing changed, Save stays focusable and says so rather than vanishing.
 */
function AltText({
  item,
  disabled,
  onSaved,
}: {
  item: MediaItem
  disabled: boolean
  onSaved: (item: MediaItem) => void
}): ReactElement {
  const id = useId()
  const [value, setValue] = useState(item.altText)
  useEffect(() => setValue(item.altText), [item.altText])
  const { busy, run: save } = useSaveAlt(item, onSaved)
  const unchanged = busy || value === item.altText
  return (
    <div className="side-field">
      <label htmlFor={id} className="side-field-label">
        Alt text
      </label>
      <input
        id={id}
        className="editor-control"
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-note`}
        onChange={(event) => setValue(event.target.value)}
      />
      <p id={`${id}-note`} className="side-note">
        Saved on the media file at once, for every page that uses it — not in this draft.
      </p>
      <SaveAltButton
        disabled={disabled}
        unchanged={unchanged}
        busy={busy}
        onSave={() => void save(value)}
      />
    </div>
  )
}

/** Save alt text: with nothing to save it stays focusable and aria-disabled */
function SaveAltButton(props: {
  disabled: boolean
  unchanged: boolean
  busy: boolean
  onSave: () => void
}): ReactElement {
  return (
    <Button
      size="sm"
      disabled={props.disabled}
      aria-disabled={props.unchanged}
      onClick={props.unchanged ? undefined : props.onSave}
    >
      {props.busy ? 'Saving…' : 'Save alt text'}
    </Button>
  )
}

/** Crop & hotspot in the image editor; disabled, like the other actions, while read-only */
function CropLink({ id, readOnly }: { id: string; readOnly: boolean }): ReactElement | null {
  const media = isEnabled(useCapabilities(), 'media')
  if (!media) return null
  if (readOnly) {
    return (
      <Button size="sm" icon={Crop} disabled>
        Crop & hotspot
      </Button>
    )
  }
  return (
    <Link to={mediaEditPath(id)} className={buttonClass('secondary', 'sm')}>
      <Crop className="ui-button-icon" aria-hidden="true" />
      Crop & hotspot
    </Link>
  )
}

/**
 * A media field's file: Crop & hotspot in the image editor, Replace (which
 * keeps the id) and its alt text — each saved on the media file, not the draft
 */
export function MediaPanel({ id, readOnly }: { id: string; readOnly: boolean }): ReactElement {
  const [loaded, setItem] = useMediaItem(id)
  if (loaded.state === 'loading') return <PanelNote>Reading the media file…</PanelNote>
  if (loaded.state === 'missing') return <PanelNote>Media {id} was not found.</PanelNote>
  const { item } = loaded
  return (
    <div className="side-media">
      <p className="side-media-name">{item.filename}</p>
      <div className="side-actions">
        <CropLink id={item.id} readOnly={readOnly} />
        <Replace item={item} disabled={readOnly} onReplaced={setItem} />
      </div>
      <PanelNote>Replacing keeps the id, so pages update without a content change.</PanelNote>
      <AltText key={item.id} item={item} disabled={readOnly} onSaved={setItem} />
    </div>
  )
}
