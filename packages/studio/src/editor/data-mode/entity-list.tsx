import { CornerDownRight, Lock } from 'lucide-react'
import { type ReactElement, useId } from 'react'
import type { EntityView, PropertyRow } from './provenance.js'
import { EntityScopeChip, SourceChip } from './scope-chip.js'

/** The element id of an entity's heading, by its place in the list: what a reference leads to */
type HeadingId = (entityId: string) => string | null

/** A linked value: each reference to an entity of this graph leads to it */
function References({ row, headingOf }: { row: PropertyRow; headingOf: HeadingId }): ReactElement {
  return (
    <span className="data-refs">
      {row.references.map((ref) => {
        const target = headingOf(ref)
        if (!target) return <code key={ref}>{ref}</code>
        return (
          <button
            key={ref}
            type="button"
            className="data-ref"
            aria-label={`Go to ${ref}`}
            onClick={() => document.getElementById(target)?.focus()}
          >
            <CornerDownRight aria-hidden="true" />
            <code>{ref}</code>
          </button>
        )
      })}
    </span>
  )
}

function Row({ row, headingOf }: { row: PropertyRow; headingOf: HeadingId }): ReactElement {
  return (
    <tr>
      <th scope="row" className="data-prop-key">
        <code>{row.key}</code>
        {row.fixed && (
          <span
            className="data-prop-fixed"
            title="Set by the type: the SEO settings cannot change it"
          >
            <Lock aria-hidden="true" />
            <span className="visually-hidden">set by the type</span>
          </span>
        )}
      </th>
      <td className="data-prop-value" data-label="Value">
        {row.references.length > 0 ? (
          <References row={row} headingOf={headingOf} />
        ) : (
          <code title={row.text}>{row.text}</code>
        )}
      </td>
      <td className="data-prop-source" data-label="Source">
        <SourceChip scope={row.scope} />
        <span className="data-prop-origin">{row.origin}</span>
      </td>
    </tr>
  )
}

/** The entity's properties: key, value and source, one row each */
function PropertyTable({
  view,
  headingOf,
}: {
  view: EntityView
  headingOf: HeadingId
}): ReactElement {
  return (
    <table className="data-props">
      <caption className="visually-hidden">
        {view.type} {view.id}: each property's value and where it comes from
      </caption>
      <thead>
        <tr>
          <th scope="col">Property</th>
          <th scope="col">Value</th>
          <th scope="col">Source</th>
        </tr>
      </thead>
      <tbody>
        {view.rows.map((row) => (
          <Row key={row.key} row={row} headingOf={headingOf} />
        ))}
      </tbody>
    </table>
  )
}

function Entity({
  view,
  headingId,
  headingOf,
}: {
  view: EntityView
  headingId: string
  headingOf: HeadingId
}): ReactElement {
  return (
    <li className="data-entity" data-entity-id={view.id}>
      <div className="data-entity-head">
        <h3 id={headingId} tabIndex={-1} className="data-entity-type">
          {view.type}
        </h3>
        <EntityScopeChip scope={view.scope} />
        <code className="data-entity-id">{view.id || 'no @id'}</code>
      </div>
      {view.rows.length === 0 ? (
        <p className="data-note">No property has a value.</p>
      ) : (
        <PropertyTable view={view} headingOf={headingOf} />
      )}
    </li>
  )
}

/** Each entity of the page's graph: its type, scope and `@id`, and every property with its source */
export function EntityList({ views }: { views: readonly EntityView[] }): ReactElement {
  const prefix = useId()
  const headingId = (index: number): string => `${prefix}-entity-${index}`
  const headingOf: HeadingId = (entityId) => {
    const index = entityId ? views.findIndex((view) => view.id === entityId) : -1
    return index >= 0 ? headingId(index) : null
  }
  return (
    <ul className="data-entities" aria-label="Entities">
      {views.map((view, index) => (
        <Entity
          // biome-ignore lint/suspicious/noArrayIndexKey: the graph's order; a node may lack an @id
          key={`${index}-${view.id}`}
          view={view}
          headingId={headingId(index)}
          headingOf={headingOf}
        />
      ))}
    </ul>
  )
}
