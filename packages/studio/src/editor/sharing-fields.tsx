import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import type { ReactElement, ReactNode } from 'react'
import type { JsonSchemaProperty } from '../lib/api-types.js'
import { Button } from '../ui/button.js'
import { StructuredValue } from './metadata-properties.js'

/** What sits under each of the search fields: a length check, a note on the image */
export type SharingChecks = Partial<Record<'title' | 'description' | 'image', ReactNode>>

interface SharingProps {
  below?: SharingChecks | undefined
  fields: Record<string, unknown>
  values: Record<string, unknown>
  schema: JsonSchemaProperty
  path: string
  errors: Readonly<Record<string, string>>
  sources: Readonly<Record<string, string>>
  readOnly: boolean
  onValues: (values: Record<string, unknown>) => void
}

/** Search overrides are opt-in; document content is context, never a second content form. */
export function SharingFields(props: SharingProps): ReactElement {
  const map = buildSeoFieldMap(Object.keys(props.fields))
  const defaults = {
    title: resolveSeoField(map, 'title', props.fields),
    description: resolveSeoField(map, 'description', props.fields),
  }
  function update(name: string, value: unknown): void {
    const next = { ...props.values }
    if (value === undefined) delete next[name]
    else next[name] = value
    props.onValues(next)
  }
  function control(name: string, label: string): ReactElement {
    return (
      <StructuredValue
        name={name}
        path={`${props.path}.${name}`}
        property={{ ...props.schema.properties?.[name], title: label }}
        value={props.values[name]}
        required={false}
        errors={props.errors}
        sources={props.sources}
        onValue={(value) => update(name, value)}
      />
    )
  }
  return (
    <div className="metadata-sharing">
      {(['title', 'description'] as const).map((name) => (
        <div key={name} className="metadata-search-value">
          {props.values[name] !== undefined ? (
            control(name, `Search ${name}`)
          ) : (
            <div className="metadata-label-row">
              <span>
                Search {name} <span className="metadata-default-label">uses the page {name}</span>
              </span>
              {!props.readOnly && (
                <Button
                  className="metadata-change"
                  size="sm"
                  variant="secondary"
                  aria-label={`Write a different search ${name}`}
                  // Start from the page's own text; an empty override when the page has none
                  onClick={() => {
                    const own = defaults[name]
                    update(name, typeof own === 'string' ? own : '')
                  }}
                >
                  Write your own
                </Button>
              )}
            </div>
          )}
          {props.below?.[name]}
        </div>
      ))}
      {control('image', 'Sharing image')}
      {props.below?.image}
      <details className="metadata-advanced">
        <summary>Advanced search settings</summary>
        {control('canonicalUrl', 'Canonical URL')}
        {control('index', 'Show in search results')}
        {control('follow', 'Allow search engines to follow links')}
      </details>
    </div>
  )
}
