import { collectionBasePath } from '@krantho/core/cache-tags'
import { PenLine } from 'lucide-react'
import { type ReactElement, useMemo, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import type { CollectionInfo, SeoConfig } from '../lib/api.js'
import { collectionLabel } from '../lib/format.js'
import type { Source } from '../lib/source.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { ArchetypeModal } from './archetype-modal.js'
import { scopeSectionId } from './scope-cascade.js'
import { type ArchetypeRow, archetypeRows, SETTINGS_UNREAD } from './scopes-model.js'
import { StructureCard, TypeChips } from './structure-card.js'
import type { Catalog } from './structure-sources.js'

export interface CollectionArchetypesProps {
  collections: readonly CollectionInfo[]
  configs: Source<SeoConfig[]>
  catalog: Catalog | null
  admin: boolean
  onSaved: () => void
}

/** Why Change cannot open, or null when it can */
function changeBlocker(
  admin: boolean,
  catalog: Catalog | null,
  configs: Source<SeoConfig[]>,
): string | null {
  if (!admin) return 'Archetypes are changed by an admin.'
  if (configs.state !== 'ok') return SETTINGS_UNREAD
  return catalog ? null : 'The catalog could not be read.'
}

function columns(
  change: (row: ArchetypeRow) => void,
  reason: string | null,
): DataColumn<ArchetypeRow>[] {
  return [
    {
      id: 'collection',
      header: 'Collection',
      primary: true,
      cell: (row) => collectionLabel(row.collection.name),
    },
    {
      id: 'path',
      header: 'Renders at',
      cell: (row) => <code>{collectionBasePath(row.collection) ?? '—'}</code>,
    },
    {
      id: 'types',
      header: 'Schema.org types',
      cell: (row) =>
        row.types ? (
          <TypeChips types={row.types} />
        ) : (
          <span className="structure-muted">Not read</span>
        ),
    },
    {
      id: 'change',
      header: 'Change',
      cell: (row) => (
        <ActionButton size="sm" icon={PenLine} reason={reason} onClick={() => change(row)}>
          Change{' '}
          <span className="visually-hidden">
            {collectionLabel(row.collection.name)}'s archetype
          </span>
        </ActionButton>
      ),
    },
  ]
}

/** Collection archetypes: the types each collection's pages state, each with Change and its impact */
export function CollectionArchetypes(props: CollectionArchetypesProps): ReactElement {
  const { collections, configs, catalog, admin, onSaved } = props
  const [changing, setChanging] = useState<ArchetypeRow | null>(null)
  const rows = useMemo(() => archetypeRows(collections, configs), [collections, configs])
  const reason = changeBlocker(admin, catalog, configs)
  return (
    <StructureCard
      id={scopeSectionId('collection')}
      title="Collection archetypes"
      lead="What kind of page each collection's documents are. Seeded from krantho.config.ts (seo.collections) when the site starts; a change here persists."
    >
      <DataTable
        caption="Collection archetypes"
        columns={columns(setChanging, reason)}
        rows={rows}
        rowKey={(row) => row.collection.name}
      />
      {changing && catalog && (
        <ArchetypeModal
          row={changing}
          catalog={catalog}
          onClose={() => setChanging(null)}
          onSaved={onSaved}
        />
      )}
    </StructureCard>
  )
}
