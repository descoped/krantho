import { buildSeoFieldMap, documentSeoProperties, resolveSeoField } from '@krantho/seo-shared'
import type { ReactElement } from 'react'
import type { SeoLimits } from '../../lib/api-types.js'
import { isEnabled, useCapabilities } from '../../lib/capabilities.js'
import { type EffectiveMeta, effectiveMetaDescription } from '../../lib/findability.js'
import type { SharingChecks } from '../sharing-fields.js'
import {
  type MetaAdvice,
  metaAdvice,
  metaLengthState,
  titleLengthState,
} from './findability-model.js'
import { LengthMeter } from './length-meter.js'
import { Fact, PanelCard } from './panel-card.js'
import { type PanelDocument, schemaFieldNames } from './panel-document.js'
import { useSocialImage } from './use-social-image.js'

/** The fields SEO discovers its concepts in: the schema's and any the draft holds besides */
function draftMeta(doc: PanelDocument): EffectiveMeta {
  const description = documentSeoProperties(doc.draft.metadata).description
  return typeof description === 'string' && description.trim()
    ? { text: description, source: 'metadata' }
    : effectiveMetaDescription(doc.draft.fields)
}

function draftTitle(doc: PanelDocument, names: string[]): string {
  const properties = documentSeoProperties(doc.draft.metadata)
  const own = properties.headline ?? properties.name
  return typeof own === 'string' && own.trim()
    ? own
    : resolveSeoField(buildSeoFieldMap(names), 'title', doc.draft.fields)
}

function discoveryNames(doc: PanelDocument): string[] {
  return [...new Set([...schemaFieldNames(doc.schema), ...Object.keys(doc.draft.fields)])]
}

/** The meta description's meter, saying where the text comes from */
function MetaMeter(props: { meta: EffectiveMeta; limits: SeoLimits; label: string }): ReactElement {
  const { meta, limits, label } = props
  const { minChars, maxChars } = limits.metaDescription
  const note =
    meta.source === 'metadata'
      ? 'Your own search description'
      : meta.source === 'description'
        ? 'Falls back to description'
        : meta.source === null
          ? 'Neither meta-description nor description is set'
          : 'From meta-description'
  return (
    <LengthMeter
      label={label}
      length={meta.text.length}
      state={metaLengthState(meta.text.length, limits.metaDescription)}
      target={{ kind: 'range', min: minChars, max: maxChars }}
      note={note}
    />
  )
}

function TitleMeter(props: { title: string; limits: SeoLimits; label: string }): ReactElement {
  const { title, limits, label } = props
  return (
    <LengthMeter
      label={label}
      length={title.length}
      state={titleLengthState(title.length, limits.title.maxChars)}
      target={{ kind: 'limit', max: limits.title.maxChars }}
    />
  )
}

/** The social image a shared link shows, through the site's fallback chain (`useSocialImage`) */
function SocialImage({ doc }: { doc: PanelDocument }): ReactElement {
  const image = useSocialImage({
    collection: doc.collection,
    slug: doc.meta?.slug ?? null,
    fields: { ...doc.draft.fields, ...documentSeoProperties(doc.draft.metadata) },
  })
  return (
    <Fact label="Social image">
      {image ? (
        <>
          Set <code>{image}</code>
        </>
      ) : (
        'None'
      )}
    </Fact>
  )
}

/** The advice; Edit is offered only to someone who may edit the form now */
function Advice({
  advice,
  readOnly,
  onEditField,
}: {
  advice: readonly MetaAdvice[]
  readOnly: boolean
  onEditField: (name: string) => void
}): ReactElement | null {
  if (advice.length === 0) return null
  return (
    <ul className="side-advice">
      {advice.map((item) => (
        <li key={item.text}>
          <span>{item.text}</span>
          {item.field && !readOnly && (
            <button
              type="button"
              className="side-link"
              aria-label={`Edit ${item.field}`}
              onClick={() => item.field && onEditField(item.field)}
            >
              Edit
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Without its own fields in the panel: the meta description and title against the limits, with advice */
function LengthChecks({
  doc,
  limits,
  names,
  onEditField,
}: {
  doc: PanelDocument
  limits: SeoLimits
  names: string[]
  onEditField: (name: string) => void
}): ReactElement {
  const meta = draftMeta(doc)
  const formFields = new Set(schemaFieldNames(doc.schema))
  const state = metaLengthState(meta.text.length, limits.metaDescription)
  return (
    <>
      <MetaMeter meta={meta} limits={limits} label="Meta description" />
      <TitleMeter title={draftTitle(doc, names)} limits={limits} label="Title" />
      <Advice
        advice={metaAdvice(meta, state, limits.metaDescription, formFields)}
        readOnly={doc.readOnly}
        onEditField={onEditField}
      />
    </>
  )
}

/** The checks that sit under the search fields, and the image the page falls back to without its own */
function fieldChecks(doc: PanelDocument, limits: SeoLimits): SharingChecks {
  const ownImage = doc.draft.metadata.sharing?.image !== undefined
  return {
    description: <MetaMeter meta={draftMeta(doc)} limits={limits} label="Length" />,
    title: (
      <TitleMeter title={draftTitle(doc, discoveryNames(doc))} limits={limits} label="Length" />
    ),
    image: ownImage ? undefined : (
      <dl className="side-facts">
        <SocialImage doc={doc} />
      </dl>
    ),
  }
}

export interface SearchAndSharingProps {
  doc: PanelDocument
  onEditField: (name: string) => void
  /**
   * The block of the page's own search fields, given the checks to show under
   * them; null when the panel does not hold the fields (Structure mode shows them)
   */
  renderFields: ((checks: SharingChecks) => ReactElement | null) | null
}

/**
 * Search and sharing: the page's search title, description and sharing image
 * with the length of each against the site's limits right under it. A page
 * whose collection declares no such fields gets the same measures of its own
 * fields, with advice. What is only setup (SEO off, limits unread, a collection
 * without pages) is not an editor's to fix, so it shows no checks, not a warning.
 */
export function SearchAndSharing(props: SearchAndSharingProps): ReactElement | null {
  const { doc, onEditField, renderFields } = props
  const seo = isEnabled(useCapabilities(), 'seo')
  const limits = seo && (doc.info?.pages ?? true) ? doc.limits : null
  if (renderFields) {
    const fields = renderFields(limits ? fieldChecks(doc, limits) : {})
    if (fields) return fields
  }
  if (!limits) return null
  return (
    <PanelCard title="Search and sharing">
      <LengthChecks
        doc={doc}
        limits={limits}
        names={discoveryNames(doc)}
        onEditField={onEditField}
      />
      <dl className="side-facts">
        <SocialImage doc={doc} />
      </dl>
    </PanelCard>
  )
}
