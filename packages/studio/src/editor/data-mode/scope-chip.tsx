import {
  Calculator,
  FileText,
  Globe,
  Layers,
  Link2,
  type LucideIcon,
  PanelsTopLeft,
  Route,
} from 'lucide-react'
import type { ReactElement } from 'react'
import type { ValueScope } from '../../lib/api-types.js'
import { chipClass } from '../../ui/chip.js'
import { ENTITY_SCOPES, type EntityScope, VALUE_SCOPES } from './provenance.js'

/** Each scope has its own icon, so a source never rests on colour alone */
const VALUE_ICONS: Readonly<Record<ValueScope, LucideIcon>> = {
  site: Globe,
  collection: Layers,
  route: Route,
  document: FileText,
  computed: Calculator,
  linked: Link2,
}

const ENTITY_ICONS: Readonly<Record<EntityScope, LucideIcon>> = {
  site: Globe,
  page: PanelsTopLeft,
}

function ScopeChip({
  icon: Icon,
  label,
  meaning,
  own,
}: {
  icon: LucideIcon
  label: string
  meaning: string
  own: boolean
}): ReactElement {
  return (
    <span className={chipClass(own ? 'accent' : 'neutral', 'data-scope')} title={meaning}>
      <Icon className="ui-chip-icon" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      <span className="visually-hidden">
        {label}: {meaning}
      </span>
    </span>
  )
}

/** Where a value comes from; the document's own values in the accent */
export function SourceChip({ scope }: { scope: ValueScope }): ReactElement {
  const { label, meaning } = VALUE_SCOPES[scope]
  return (
    <ScopeChip
      icon={VALUE_ICONS[scope]}
      label={label}
      meaning={meaning}
      own={scope === 'document'}
    />
  )
}

/** Whether an entity is the site's, emitted by every page, or this page's own */
export function EntityScopeChip({ scope }: { scope: EntityScope }): ReactElement {
  const { label, meaning } = ENTITY_SCOPES[scope]
  return (
    <ScopeChip icon={ENTITY_ICONS[scope]} label={label} meaning={meaning} own={scope === 'page'} />
  )
}

/** The sources the graph's values come from, each with what it means and how many values */
export function ScopeLegend({
  counts,
}: {
  counts: ReadonlyArray<readonly [ValueScope, number]>
}): ReactElement {
  return (
    <ul className="data-legend" aria-label="Sources">
      {counts.map(([scope, count]) => (
        <li key={scope}>
          <SourceChip scope={scope} />
          <span className="data-legend-text">
            {VALUE_SCOPES[scope].meaning} · {count}
          </span>
        </li>
      ))}
    </ul>
  )
}
