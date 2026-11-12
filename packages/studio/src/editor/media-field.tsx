import { CircleAlert, CircleCheck, ImageOff } from 'lucide-react'
import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react'
import { fetchMediaItem } from '../lib/api.js'
import type { MediaItem } from '../lib/api-types.js'
import { formatSize } from '../lib/format.js'
import { mediaPreviewUrl } from '../lib/media-urls.js'
import { MediaPickerModal } from '../media/media-picker.js'
import { Button } from '../ui/button.js'
import type { FieldInputProps } from './field-inputs.js'

type Selected =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'missing'; id: string }
  | { state: 'ready'; item: MediaItem }

/** The media file a field points at, read whenever the id changes */
function useSelected(id: string): [Selected, (item: MediaItem) => void] {
  const [selected, setSelected] = useState<Selected>({ state: id ? 'loading' : 'none' })
  useEffect(() => {
    if (!id) {
      setSelected({ state: 'none' })
      return
    }
    let active = true
    setSelected((current) =>
      current.state === 'ready' && current.item.id === id ? current : { state: 'loading' },
    )
    fetchMediaItem(id)
      .then((item) => active && setSelected({ state: 'ready', item }))
      .catch(() => active && setSelected({ state: 'missing', id }))
    return () => {
      active = false
    }
  }, [id])
  return [selected, (item) => setSelected({ state: 'ready', item })]
}

function Details({ item }: { item: MediaItem }): ReactElement {
  const hasAlt = item.altText.trim() !== ''
  return (
    <>
      <img className="editor-media-thumb" src={mediaPreviewUrl(item, 'sm')} alt="" />
      <div className="editor-media-text">
        <span className="editor-media-name">{item.filename}</span>
        <span className="editor-media-meta">
          {item.width !== null && item.height !== null && `${item.width} × ${item.height} · `}
          {formatSize(item.size)}
        </span>
        <span
          className={hasAlt ? 'editor-media-alt' : 'editor-media-alt editor-media-alt--missing'}
        >
          {hasAlt ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          {hasAlt ? 'Alt text set' : 'No alt text'}
        </span>
      </div>
    </>
  )
}

function Summary({ selected }: { selected: Selected }): ReactElement {
  if (selected.state === 'ready') return <Details item={selected.item} />
  const text =
    selected.state === 'loading'
      ? 'Loading…'
      : selected.state === 'missing'
        ? `Media ${selected.id} was not found`
        : 'No image chosen'
  return (
    <>
      <span className="editor-media-thumb editor-media-thumb--empty" aria-hidden="true">
        <ImageOff />
      </span>
      <span className="editor-media-text editor-media-meta">{text}</span>
    </>
  )
}

/** Change (or Choose image) and Clear; Clear keeps focus on the field */
function MediaActions({
  id,
  current,
  describedBy,
  changeRef,
  onPick,
  onClear,
}: {
  id: string
  current: string
  describedBy: string | undefined
  changeRef: RefObject<HTMLButtonElement | null>
  onPick: () => void
  onClear: () => void
}): ReactElement {
  return (
    <div className="editor-media-actions">
      <Button id={id} ref={changeRef} size="sm" aria-describedby={describedBy} onClick={onPick}>
        {current ? 'Change' : 'Choose image'}
      </Button>
      {current && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClear()
            changeRef.current?.focus()
          }}
        >
          Clear
        </Button>
      )}
    </div>
  )
}

/** What a screen reader hears of the field's state: required, and not valid after a refused save */
function stateText(required: boolean, invalid: boolean): string | null {
  const parts = [required ? 'Required' : null, invalid ? 'not valid' : null].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** A media field: the chosen file's thumbnail, name, size and alt text, with Change and Clear */
export function MediaField(props: FieldInputProps): ReactElement {
  const { id, labelId, name, value, onChange } = props
  const current = typeof value === 'string' ? value : ''
  const [selected, choose] = useSelected(current)
  const [picking, setPicking] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  const state = stateText(props.required, props.invalid)
  const describedBy =
    [state ? `${id}-state` : null, props.describedBy].filter(Boolean).join(' ') || undefined
  function pick(item: MediaItem): void {
    choose(item)
    onChange(name, item.id)
    setPicking(false)
  }
  return (
    <fieldset className="editor-media" aria-labelledby={labelId} aria-describedby={describedBy}>
      {state && (
        <span id={`${id}-state`} className="visually-hidden">
          {state}
        </span>
      )}
      <Summary selected={selected} />
      <MediaActions
        id={id}
        current={current}
        describedBy={describedBy}
        changeRef={changeRef}
        onPick={() => setPicking(true)}
        onClear={() => onChange(name, '')}
      />
      {picking && (
        <MediaPickerModal onSelect={pick} onUpload={pick} onClose={() => setPicking(false)} />
      )}
    </fieldset>
  )
}
