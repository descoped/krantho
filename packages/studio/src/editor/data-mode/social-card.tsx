import { type ReactElement, type RefObject, useId, useRef, useState } from 'react'
import type { MediaItem } from '../../lib/api-types.js'
import { MediaPickerModal } from '../../media/media-picker.js'
import { Button } from '../../ui/button.js'
import { DataCard } from './data-card.js'
import { DataField, textOf } from './data-field.js'
import type { PagePreview } from './preview-model.js'
import { SocialPreview } from './social-preview.js'
import './social-card.css'

const OG_TYPES = ['website', 'article', 'product', 'profile'] as const

export interface SocialCardProps {
  preview: PagePreview
  fields: Readonly<Record<string, unknown>>
  readOnly: boolean
  onField: (name: string, value: unknown) => void
}

type FieldProps = Omit<SocialCardProps, 'preview' | 'readOnly'>

/** Change (or Choose image) and Clear; Clear hands focus to Change */
function ImageButtons({
  value,
  chooseRef,
  onChoose,
  onClear,
}: {
  value: string
  chooseRef: RefObject<HTMLButtonElement | null>
  onChoose: () => void
  onClear: () => void
}): ReactElement {
  return (
    <>
      <Button ref={chooseRef} size="sm" onClick={onChoose}>
        {value ? 'Change' : 'Choose image'}
      </Button>
      {value && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClear()
            chooseRef.current?.focus()
          }}
        >
          Clear
        </Button>
      )}
    </>
  )
}

/** og-image: an address chosen from the media library, with Clear */
function ImageChoice({
  fields,
  readOnly,
  onField,
}: Omit<SocialCardProps, 'preview'>): ReactElement {
  const value = textOf(fields['og-image'])
  const [picking, setPicking] = useState(false)
  const chooseRef = useRef<HTMLButtonElement>(null)
  function pick(item: MediaItem): void {
    onField('og-image', item.url)
    setPicking(false)
  }
  return (
    <fieldset className="data-field data-image-field" disabled={readOnly}>
      <legend className="data-field-label">og-image</legend>
      <div className="data-image-choice">
        <code className="data-image-value">
          {value || 'None: the page image or the site default'}
        </code>
        <ImageButtons
          value={value}
          chooseRef={chooseRef}
          onChoose={() => setPicking(true)}
          onClear={() => onField('og-image', '')}
        />
      </div>
      <p className="data-field-help">1200 × 630 pixels suits most networks.</p>
      {picking && (
        <MediaPickerModal onSelect={pick} onUpload={pick} onClose={() => setPicking(false)} />
      )}
    </fieldset>
  )
}

/** og-title and og-description: text that replaces the title and meta description when shared */
function TextOverride({
  name,
  help,
  area,
  fields,
  onField,
}: FieldProps & { name: string; help: string; area: boolean }): ReactElement {
  const id = useId()
  const control = {
    id,
    value: textOf(fields[name]),
    'aria-describedby': `${id}-help`,
    onChange: (event: { target: { value: string } }) => onField(name, event.target.value),
  }
  return (
    <DataField id={id} label={name} help={help}>
      {area ? (
        <textarea {...control} className="editor-control editor-control--area" rows={2} />
      ) : (
        <input {...control} className="editor-control" />
      )}
    </DataField>
  )
}

function TypeOverride({ fields, onField }: FieldProps): ReactElement {
  const id = useId()
  return (
    <DataField id={id} label="og-type" help="Auto: website.">
      <select
        id={id}
        className="editor-control editor-control--short"
        value={textOf(fields['og-type'])}
        aria-describedby={`${id}-help`}
        onChange={(event) => onField('og-type', event.target.value)}
      >
        <option value="">Auto</option>
        {OG_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </DataField>
  )
}

/** How a shared link shows, and the Open Graph overrides that change it — saved with the draft */
export function SocialCard(props: SocialCardProps): ReactElement {
  const { fields, readOnly, onField } = props
  return (
    <DataCard
      title="Social cards"
      lead="From the draft's current values. The overrides are fields of the document, saved with the draft."
    >
      <SocialPreview preview={props.preview} />
      <fieldset className="data-fields" disabled={readOnly}>
        <legend className="data-fields-legend">Overrides for sharing</legend>
        <TextOverride
          name="og-title"
          help="Empty: the page title."
          area={false}
          fields={fields}
          onField={onField}
        />
        <TextOverride
          name="og-description"
          help="Empty: the meta description."
          area
          fields={fields}
          onField={onField}
        />
        <TypeOverride fields={fields} onField={onField} />
      </fieldset>
      <ImageChoice fields={fields} readOnly={readOnly} onField={onField} />
    </DataCard>
  )
}
