import type { ContentContract, DefaultProvenance } from '@krantho/core'
import type { ReactElement, ReactNode } from 'react'
import type { DocumentMeta, JsonSchemaProperty } from '../lib/api-types.js'
import { Button } from '../ui/button.js'
import { propertyLabel, StructuredProperties } from './metadata-properties.js'
import { type SharingChecks, SharingFields } from './sharing-fields.js'
import { SystemFields } from './system-fields.js'
import './metadata-editor.css'

export { StructuredValue } from './metadata-properties.js'

/** Source hints follow the current draft; an authored override no longer claims inheritance. */
function sourcesOf(
  defaults: readonly DefaultProvenance[],
  metadata: Record<string, Record<string, unknown>>,
): Record<string, string> {
  return Object.fromEntries(
    defaults.flatMap((source) =>
      source.paths.flatMap((path) => {
        const parts = path
          .slice(1)
          .split('/')
          .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
        let value: unknown = metadata
        for (const part of parts.slice(1)) {
          if (!value || typeof value !== 'object') return []
          value = (value as Record<string, unknown>)[part]
        }
        if (JSON.stringify(value) !== JSON.stringify(source.values[path])) return []
        return [[parts.join('.'), `${source.collection}/${source.slug} · v${source.version}`]]
      }),
    ),
  )
}

/** Which declared groups a block shows: all of them, all but Search and sharing, or only it */
export type MetadataScope = 'all' | 'metadata' | 'sharing'

const SHARING_ID = 'krantho/sharing'

function inScope(scope: MetadataScope, group: ContentContract['metadata'][string]): boolean {
  if (scope === 'all') return true
  return (group.id === SHARING_ID) === (scope === 'sharing')
}

/**
 * One declared group: its label and the name the page reads it by, then its
 * fields. Search and sharing is a disclosure beside the other groups, and the
 * body of its own block when it has one.
 */
function GroupShell(props: {
  sharing: boolean
  /** The group is the whole of its block: no title, no disclosure */
  bare: boolean
  group: ContentContract['metadata'][string]
  slot: string
  /** A field of the group has an error: the disclosure shows it */
  invalid: boolean
  children: ReactNode
}): ReactElement {
  const { group, slot } = props
  const title = (
    <>
      {group.label}
      <code className="metadata-key" title="The name your page reads it by">
        {slot}
      </code>
      {group.required && <span className="metadata-help"> · Required</span>}
    </>
  )
  if (props.bare) return <div className="metadata-group metadata-group--bare">{props.children}</div>
  if (props.sharing)
    return (
      <details className="metadata-group" open={group.required || props.invalid}>
        <summary>{group.label}</summary>
        {props.children}
      </details>
    )
  return (
    <section className="metadata-group" aria-label={group.label}>
      <h4 className="metadata-group-title">{title}</h4>
      {props.children}
    </section>
  )
}

export function MetadataEditor(props: {
  /** The groups this block shows; every group by default */
  scope?: MetadataScope | undefined
  /** What the page's search text measures against, shown under its fields */
  checks?: SharingChecks | undefined
  contract: ContentContract
  metadata: Record<string, Record<string, unknown>>
  defaults?: readonly DefaultProvenance[] | undefined
  fields?: Record<string, unknown> | undefined
  /** The saved version's system fields, shown read only */
  system?: DocumentMeta | null | undefined
  onOpenData?: (() => void) | null | undefined
  groupActions?: ((slot: string) => ReactNode) | undefined
  readOnly: boolean
  errors: Readonly<Record<string, string>>
  onMetadata: (metadata: Record<string, Record<string, unknown>>) => void
}): ReactElement | null {
  const scope = props.scope ?? 'all'
  const groups = Object.entries(props.contract.metadata).filter(([, group]) =>
    inScope(scope, group),
  )
  const outside = Object.entries(props.metadata).filter(
    ([slot]) => scope !== 'sharing' && !Object.hasOwn(props.contract.metadata, slot),
  )
  if (groups.length === 0 && outside.length === 0) return null
  const sources = sourcesOf(props.defaults ?? [], props.metadata)
  const title = scope === 'sharing' ? 'Search and sharing' : 'Metadata'
  return (
    <section className="editor-metadata" aria-label={title}>
      <h3>{title}</h3>
      <p className="metadata-intro">
        {scope === 'sharing'
          ? 'How this page appears in search results and when it is shared.'
          : 'Saved with the page, and published with it.'}
      </p>
      <fieldset disabled={props.readOnly} className="metadata-groups">
        {groups.map(([slot, group]) => {
          const values = props.metadata[slot]
          const present = values !== undefined || group.required
          const update = (next: Record<string, unknown>): void =>
            props.onMetadata({ ...props.metadata, [slot]: next })
          if (
            slot === 'seo' &&
            (group.schema['properties'] as Record<string, unknown>)?.['entities']
          )
            return (
              <div key={slot} className="metadata-group metadata-graph-link">
                <div>
                  <strong>Structured data</strong>
                  <p className="metadata-help">
                    Manage how this page is described to search engines.
                  </p>
                </div>
                {props.onOpenData ? (
                  <Button size="sm" variant="secondary" onClick={props.onOpenData}>
                    Open graph editor
                  </Button>
                ) : (
                  <p className="metadata-help">Available in Data view.</p>
                )}
              </div>
            )
          // An optional group not in use is one row with its action, not a closed disclosure
          if (!present && group.id !== SHARING_ID)
            return (
              <div key={slot} className="metadata-group metadata-group--absent">
                <strong>{group.label}</strong>
                {!props.readOnly && (
                  <Button variant="secondary" size="sm" onClick={() => update({})}>
                    Add
                  </Button>
                )}
              </div>
            )
          return (
            <GroupShell
              key={slot}
              sharing={group.id === SHARING_ID}
              bare={scope === 'sharing'}
              group={group}
              slot={slot}
              invalid={Object.keys(props.errors).some((path) =>
                path.startsWith(`metadata.${slot}`),
              )}
            >
              {group.id === SHARING_ID ? (
                <SharingFields
                  below={props.checks}
                  fields={props.fields ?? {}}
                  values={values ?? {}}
                  schema={group.schema as JsonSchemaProperty}
                  path={`metadata.${slot}`}
                  errors={props.errors}
                  sources={sources}
                  readOnly={props.readOnly}
                  onValues={update}
                />
              ) : (
                <StructuredProperties
                  property={group.schema as JsonSchemaProperty}
                  values={values ?? {}}
                  path={`metadata.${slot}`}
                  errors={props.errors}
                  sources={sources}
                  onValues={update}
                />
              )}
              {present && !group.required && !props.readOnly && (
                <Button
                  className="metadata-remove-group"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = { ...props.metadata }
                    delete next[slot]
                    props.onMetadata(next)
                  }}
                >
                  Remove {group.label.toLowerCase()}
                </Button>
              )}
              {!props.readOnly && props.groupActions?.(slot)}
              {props.errors[`metadata.${slot}`] && (
                <p role="alert">{props.errors[`metadata.${slot}`]}</p>
              )}
            </GroupShell>
          )
        })}
        {outside.map(([slot, values]) => (
          <details key={slot} className="metadata-group">
            <summary>{propertyLabel(slot, {})}</summary>
            <p>
              These details are outside the current content form. Review them before removing them
              from this draft.
            </p>
            <dl>
              {Object.entries(values).map(([name, value]) => (
                <div key={name}>
                  <dt>{propertyLabel(name, {})}</dt>
                  <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                </div>
              ))}
            </dl>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = { ...props.metadata }
                delete next[slot]
                props.onMetadata(next)
              }}
            >
              Remove these details
            </Button>
          </details>
        ))}
      </fieldset>
      {props.system && scope !== 'sharing' && <SystemFields meta={props.system} />}
    </section>
  )
}
