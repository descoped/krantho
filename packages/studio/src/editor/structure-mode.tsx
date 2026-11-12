import type { AuthoredMetadata } from '@krantho/core'
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useId,
  useMemo,
} from 'react'
import type { CollectionSchema } from '../lib/api-types.js'
import { CustomFields } from './custom-fields.js'
import type { Draft } from './editor-model.js'
import { SYSTEM_FIELDS, seoFieldUses } from './field-model.js'
import { FieldRow } from './field-row.js'
import { MarkdownBody } from './markdown-body.js'
import { MetadataEditor } from './metadata-editor.js'
import type { EditorKind } from './modes.js'
import { selectsOnKeyUp } from './side-panel/selection.js'
import './structure-mode.css'

/** A new document's slug, suggested from its title until edited */
export interface NewSlug {
  value: string
  onChange: (value: string) => void
}

export interface StructureModeProps {
  kind: EditorKind
  schema: CollectionSchema
  draft: Draft
  /** The fields the document was opened with: a global shows these, so clearing one keeps its row */
  openedFields: readonly string[]
  /** Set for a document not saved yet */
  newSlug: NewSlug | null
  /** Another user holds the lock, or the role cannot edit: every input is disabled */
  readOnly: boolean
  fieldErrors: Readonly<Record<string, string>>
  /** Whether SEO reads this document's fields (SEO is on and the document has a page) */
  seoReadsFields: boolean
  canPromote: boolean
  onField: (name: string, value: unknown) => void
  onBody: (value: string) => void
  defaults?: AuthoredMetadata['defaults'] | undefined
  groupActions?: ((slot: string) => ReactNode) | undefined
  onOpenData?: (() => void) | undefined
  onMetadata: (metadata: Draft['metadata']) => void
  /** Promote a custom field; resolves once the schema is read again */
  onPromote: (name: string, value: unknown) => Promise<void>
  /** A field is being worked on — focused or clicked within its row: the side panel shows it */
  onSelectField?: ((name: string) => void) | undefined
  /** The body's caret moved: the side panel shows the section it sits in */
  onCaret?: ((body: string, caret: number) => void) | undefined
}

/** The schema or custom field whose row an event happened in; none for a new document's slug */
function fieldOf(target: EventTarget, newSlug: NewSlug | null): string | null {
  if (!(target instanceof Element)) return null
  const name = target.closest('[data-field]')?.getAttribute('data-field') ?? null
  return name === 'slug' && newSlug ? null : name
}

/** The fieldset's handlers that report the field being worked on: focus, a click, or an editing key within its row */
function fieldSelection(props: StructureModeProps): {
  onFocus: (event: SyntheticEvent) => void
  onClick: (event: SyntheticEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
} {
  const select = (event: SyntheticEvent): void => {
    const name = fieldOf(event.target, props.newSlug)
    if (name) props.onSelectField?.(name)
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (selectsOnKeyUp(event.key)) select(event)
  }
  return { onFocus: select, onClick: select, onKeyUp }
}

/** A new document's slug, as a field: required, with help and the error a refused save gave it */
const SLUG_PROPERTY = {
  type: 'string',
  description:
    "Part of the page's address: lowercase words joined by hyphens, suggested from the title.",
} as const

function SlugField({
  idPrefix,
  slug,
  error,
}: {
  idPrefix: string
  slug: NewSlug
  error: string | undefined
}): ReactElement {
  return (
    <FieldRow
      idPrefix={idPrefix}
      name="slug"
      property={SLUG_PROPERTY}
      value={slug.value}
      required
      seoUse={null}
      error={error}
      onChange={(_name, value) => slug.onChange(typeof value === 'string' ? value : '')}
    />
  )
}

/**
 * The schema's fields in order. A global shows the fields its document was
 * opened with, so a row never vanishes when its value is cleared
 */
function useShownFields(props: StructureModeProps): string[] {
  const { schema, kind, openedFields } = props
  return useMemo(() => {
    const names = Object.keys(schema.schema.properties ?? {}).filter((n) => !SYSTEM_FIELDS.has(n))
    return kind === 'global' ? names.filter((name) => openedFields.includes(name)) : names
  }, [schema, kind, openedFields])
}

/** Which SEO outputs read each schema field; none when SEO does not read this document */
function useSeoUses(schema: CollectionSchema, seoReadsFields: boolean): Map<string, string> {
  return useMemo(
    () =>
      seoReadsFields
        ? seoFieldUses(Object.keys(schema.schema.properties ?? {}))
        : new Map<string, string>(),
    [seoReadsFields, schema],
  )
}

/** The schema's fields, each with its label, type, SEO use, input and help */
function SchemaFields({
  props,
  idPrefix,
}: {
  props: StructureModeProps
  idPrefix: string
}): ReactElement[] {
  const { schema, draft, fieldErrors, onField } = props
  const shown = useShownFields(props)
  const seoUses = useSeoUses(schema, props.seoReadsFields)
  const properties = schema.schema.properties ?? {}
  const required = new Set(schema.schema.required ?? [])
  return shown.map((name) => (
    <FieldRow
      key={name}
      idPrefix={idPrefix}
      name={name}
      property={properties[name] ?? {}}
      value={draft.fields[name]}
      required={required.has(name)}
      seoUse={seoUses.get(name) ?? null}
      error={fieldErrors[name]}
      onChange={onField}
    />
  ))
}

/** Structure mode: the whole document at once — every field of the schema, then the body */
export function StructureMode(props: StructureModeProps): ReactElement {
  const { schema, draft, newSlug, readOnly } = props
  const idPrefix = useId()
  const properties = schema.schema.properties ?? {}
  const custom = Object.entries(draft.fields).filter(
    ([name]) => !(name in properties) && !SYSTEM_FIELDS.has(name),
  )
  return (
    <div className="editor-structure">
      <fieldset className="editor-structure-fields" disabled={readOnly} {...fieldSelection(props)}>
        <legend className="visually-hidden">Fields</legend>
        {newSlug && <SlugField idPrefix={idPrefix} slug={newSlug} error={props.fieldErrors.slug} />}
        <SchemaFields props={props} idPrefix={idPrefix} />
        <CustomFields
          idPrefix={idPrefix}
          entries={custom}
          onChange={props.onField}
          onPromote={(name, value) => {
            // A promoted field moves into the schema's fields: focus follows it there
            void props.onPromote(name, value).then(() => {
              document.getElementById(`${idPrefix}-${name}`)?.focus()
            })
          }}
          canPromote={props.canPromote}
        />
      </fieldset>
      {schema.contract.body === 'none' && draft.body.length > 0 && (
        <div role="alert">
          <p>This content form has no text body. Remove the text before saving.</p>
          <button type="button" disabled={readOnly} onClick={() => props.onBody('')}>
            Remove the text body
          </button>
        </div>
      )}
      {props.kind === 'page' && (schema.contract.body !== 'none' || draft.body.length > 0) && (
        <MarkdownBody
          value={draft.body}
          onChange={props.onBody}
          disabled={readOnly}
          onCaret={props.onCaret}
        />
      )}
      <MetadataEditor
        contract={schema.contract}
        metadata={draft.metadata}
        fields={draft.fields}
        defaults={props.defaults}
        groupActions={props.groupActions}
        onOpenData={props.onOpenData}
        readOnly={readOnly}
        errors={props.fieldErrors}
        onMetadata={props.onMetadata}
      />
    </div>
  )
}
