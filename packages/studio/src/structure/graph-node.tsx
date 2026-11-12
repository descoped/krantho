import {
  CircleCheck,
  CircleMinus,
  FileText,
  Globe,
  Layers,
  type LucideIcon,
  Route,
  Sparkle,
  TriangleAlert,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { shortenId } from '../lib/jsonld-graph.js'
import { chipClass } from '../ui/chip.js'
import { type GraphNodeView, NODE_KINDS, type NodeKind } from './graph-model.js'

/** Each kind has its own icon, so where a node comes from never rests on colour alone */
export const KIND_ICONS: Readonly<Record<NodeKind, LucideIcon>> = {
  site: Globe,
  collection: Layers,
  route: Route,
  document: FileText,
  derived: Sparkle,
}

function properties(count: number): string {
  return count === 1 ? '1 property' : `${count} properties`
}

/** The node's rich results in a word: eligible for each, or how many fall short */
function richText(node: GraphNodeView): { text: string; eligible: boolean } | null {
  if (node.features.length === 0) return null
  const names = [...new Set(node.features.map((f) => f.feature))].join(', ')
  const eligible = node.features.every((f) => f.eligible)
  const conditional = node.features.every((f) => f.eligible || f.status === 'restricted')
  const note = eligible ? '' : conditional ? ' · on conditions' : ' · not eligible'
  return { text: `${names}${note}`, eligible }
}

/** The kind of a node, as a chip with its icon and its word */
export function KindChip({ kind }: { kind: NodeKind }): ReactElement {
  const Icon = KIND_ICONS[kind]
  return (
    <span className={chipClass('neutral', 'structure-kind')} title={NODE_KINDS[kind].meaning}>
      <Icon className="ui-chip-icon" aria-hidden="true" />
      {NODE_KINDS[kind].label}
    </span>
  )
}

/** A node's chips: its property count, its rich results, and what they lack */
export function NodeChips({ node }: { node: GraphNodeView }): ReactElement {
  const rich = richText(node)
  return (
    <span className="structure-node-chips">
      <span className={chipClass('neutral')}>{properties(node.propertyCount)}</span>
      {rich && (
        <span className={chipClass(rich.eligible ? 'success' : 'warning')}>
          {rich.eligible ? (
            <CircleCheck className="ui-chip-icon" aria-hidden="true" />
          ) : (
            <CircleMinus className="ui-chip-icon" aria-hidden="true" />
          )}
          {rich.text}
        </span>
      )}
      {node.missing.length > 0 && (
        <span className={chipClass('danger')}>
          <TriangleAlert className="ui-chip-icon" aria-hidden="true" />
          {node.missing.length} missing
        </span>
      )}
    </span>
  )
}

/** What a node button shows: its type, kind, `@id` and chips */
export function NodeFace({ node }: { node: GraphNodeView }): ReactElement {
  return (
    <>
      <span className="structure-node-head">
        <span className="structure-node-type">{node.type}</span>
        <KindChip kind={node.kind} />
      </span>
      <code className="structure-node-id" title={node.id || undefined}>
        {node.id ? shortenId(node.id) : 'no @id'}
      </code>
      <NodeChips node={node} />
    </>
  )
}
