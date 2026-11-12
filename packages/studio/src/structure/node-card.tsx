import { TriangleAlert, Wrench } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { EntityList } from '../editor/data-mode/entity-list.js'
import type { PageSearchFeature } from '../lib/api-seo.js'
import { dataModePath, structureScopesPath } from '../lib/paths.js'
import { buttonClass } from '../ui/button.js'
import { type GraphNodeView, NODE_KINDS } from './graph-model.js'
import { KindChip } from './graph-node.js'
import '../editor/data-mode/graph-card.css'

export interface NodeCardProps {
  node: GraphNodeView
  /** The page the graph is of */
  collection: string
  slug: string
  /** A reader's name, by its id */
  readerName: (id: string) => string
}

/** Where a node's values are set: the scope it comes from, or the page's Data mode */
function fixPath(props: NodeCardProps): string {
  const { node, collection, slug } = props
  if (node.kind === 'site') return structureScopesPath('site')
  return dataModePath(collection, slug)
}

/** Where the node comes from, and where its values are changed */
function note(props: NodeCardProps): string {
  switch (props.node.kind) {
    case 'site':
      return 'Every page states it. Its values are set in Scopes & archetypes › Site entities, or come from the site section of krantho.config.ts.'
    case 'collection':
      return "Its type comes from the collection's archetype; its values from the page's fields and the SEO settings. Set a value for this page in its Data mode."
    case 'route':
      return "Its type comes from a URL pattern's override. Set a value for this page in its Data mode."
    case 'document':
      return "Its type comes from this page's own SEO settings, which its Data mode edits."
    case 'derived':
      return 'krantho composes it for the page from what the page states (its address, its trail, its dates). Change those, not this node.'
  }
}

/** A feature that lacks something: what, by whose rule, and where to fix it */
function Missing({
  feature,
  props,
}: {
  feature: PageSearchFeature
  props: NodeCardProps
}): ReactElement {
  return (
    <li className="structure-missing">
      <TriangleAlert className="structure-missing-icon" aria-hidden="true" />
      <span className="structure-missing-text">
        {props.readerName(feature.reader)}'s {feature.feature} needs{' '}
        {feature.missing.map((property, index) => (
          <span key={property}>
            {index > 0 && ', '}
            <code>{property}</code>
          </span>
        ))}
        .{' '}
        <a href={feature.source} target="_blank" rel="noreferrer" className="structure-link">
          The rule <span className="visually-hidden">(opens in a new tab)</span>
        </a>
      </span>
      <Link to={fixPath(props)} className={buttonClass('secondary', 'sm')}>
        <Wrench className="ui-button-icon" aria-hidden="true" />
        Fix <span className="visually-hidden">{feature.feature}</span>
      </Link>
    </li>
  )
}

/**
 * The selected node: its kind, the requirements a search feature finds
 * missing with a Fix that leads to where they are set, a note on where the
 * node comes from, then its type and `@id` and each property with its value
 * and source (Data mode's entity list)
 */
export function NodeCard(props: NodeCardProps): ReactElement {
  const { node } = props
  const lacking = node.features.filter((feature) => feature.missing.length > 0)
  const conditions = [...new Set(node.features.flatMap((feature) => feature.conditions))]
  return (
    <section
      className="structure-card structure-node-card"
      aria-label={`Selected node: ${node.type}`}
    >
      <div className="structure-card-head">
        <h3 className="structure-card-title">Selected node</h3>
        <KindChip kind={node.kind} />
      </div>
      {lacking.length > 0 && (
        <ul className="structure-missing-list" aria-label="Missing requirements">
          {lacking.map((feature) => (
            <Missing key={`${feature.reader}:${feature.feature}`} feature={feature} props={props} />
          ))}
        </ul>
      )}
      <p className="structure-note">
        {NODE_KINDS[node.kind].meaning}. {note(props)}
      </p>
      {conditions.map((condition) => (
        <p key={condition} className="structure-note">
          Shown on a condition: {condition}.
        </p>
      ))}
      <EntityList views={[node.view]} />
    </section>
  )
}
