import { buildSeoFieldMap } from '@krantho/seo-shared'
import type { ReactElement } from 'react'
import type { JsonSchemaProperty, SeoLimits } from '../../lib/api-types.js'
import { effectiveMetaDescription } from '../../lib/findability.js'
import { Chip } from '../../ui/chip.js'
import { fieldKind, seoFieldUses, typePill } from '../field-model.js'
import { inPlaceKind, type LiveFound } from '../live-marks.js'
import { metaLengthState, titleLengthState } from './findability-model.js'
import { LengthMeter } from './length-meter.js'
import { MediaPanel } from './media-panel.js'
import { Fact, PanelCard, PanelNote } from './panel-card.js'
import { type PanelDocument, schemaFieldNames } from './panel-document.js'

/** Which SEO outputs read the field, as Structure mode's chip says it */
function readBy(doc: PanelDocument, name: string): string {
  if (!doc.seoReadsFields) return 'Nothing: SEO does not read this document'
  return seoFieldUses(schemaFieldNames(doc.schema)).get(name) ?? 'No SEO output'
}

/**
 * Whether Live mode found the field marked on the page, and — when it did —
 * whether it can be typed in place there, or why not
 */
function onThePage(doc: PanelDocument, live: LiveFound, name: string): string {
  if (!live.fields.has(name)) return 'Not found marked by Live mode'
  const kind = inPlaceKind(name, doc.schema, doc.draft)
  if (kind === 'media') return 'Found by Live mode; media changes after Save'
  if (doc.readOnly) return 'Found by Live mode; read-only'
  if (kind === 'other') return 'Found by Live mode; not a text field: edit it in Structure mode'
  return 'Found by Live mode: editable in place'
}

/** Where the effective meta description comes from, seen from the selected field */
function metaNote(name: string, source: 'meta-description' | 'description' | null): string {
  if (source === name) return 'Search results show this field.'
  if (source === null) return 'Neither meta-description nor description is set.'
  if (name === 'description')
    return 'The fallback: search results show meta-description while it is set.'
  return 'Empty, so search results fall back to description.'
}

/** The length meters a field has: the title against its limit, the meta description's effective length */
function FieldMeters({
  doc,
  name,
  limits,
}: {
  doc: PanelDocument
  name: string
  limits: SeoLimits
}): ReactElement | null {
  const { fields } = doc.draft
  if (name === 'meta-description' || name === 'description') {
    const meta = effectiveMetaDescription(fields)
    const { minChars, maxChars } = limits.metaDescription
    return (
      <LengthMeter
        label="Meta description, effective"
        length={meta.text.length}
        state={metaLengthState(meta.text.length, limits.metaDescription)}
        target={{ kind: 'range', min: minChars, max: maxChars }}
        note={metaNote(name, meta.source)}
      />
    )
  }
  if (buildSeoFieldMap(schemaFieldNames(doc.schema)).title !== name) return null
  const value = fields[name]
  const length = typeof value === 'string' ? value.length : 0
  return (
    <LengthMeter
      label="Title"
      length={length}
      state={titleLengthState(length, limits.title.maxChars)}
      target={{ kind: 'limit', max: limits.title.maxChars }}
    />
  )
}

function MediaFile({ doc, name }: { doc: PanelDocument; name: string }): ReactElement {
  const value = doc.draft.fields[name]
  const id = typeof value === 'string' ? value : ''
  if (!id) return <PanelNote>No file chosen. Choose one in the form.</PanelNote>
  return <MediaPanel id={id} readOnly={doc.readOnly} />
}

/**
 * A field selected: its schema type and whether it is required, which SEO
 * outputs read it, in Live mode whether the page marks it, its length meters
 * while SEO reads the document, and — for a media field — its file
 */
export function FieldView({ doc, name }: { doc: PanelDocument; name: string }): ReactElement {
  const properties = doc.schema.schema.properties ?? {}
  const property: JsonSchemaProperty | undefined = properties[name]
  const required = (doc.schema.schema.required ?? []).includes(name)
  return (
    <PanelCard summary={<Chip>{required ? 'required' : 'optional'}</Chip>}>
      <dl className="side-facts">
        <Fact label="Type">
          {property ? <code>{typePill(property, name)}</code> : 'Not in the schema (custom field)'}
        </Fact>
        <Fact label="Required">{required ? 'Yes' : 'No'}</Fact>
        <Fact label="Read by">{readBy(doc, name)}</Fact>
        {doc.live && <Fact label="On the page">{onThePage(doc, doc.live, name)}</Fact>}
      </dl>
      {doc.seoReadsFields && doc.limits && (
        <FieldMeters doc={doc} name={name} limits={doc.limits} />
      )}
      {property && fieldKind(property, name) === 'media' && <MediaFile doc={doc} name={name} />}
    </PanelCard>
  )
}
