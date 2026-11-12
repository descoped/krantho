import { Plus, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { CatalogType } from '../../lib/api-types.js'
import { isOffered } from '../../lib/catalog-offer.js'
import { CATEGORY_LABELS, type CatalogCategory } from '../../lib/jsonld-graph.js'
import './add-entity-picker.css'

interface AddEntityPickerProps {
  catalogTypes: readonly CatalogType[]
  onAdd: (type: string) => void
}

interface CategoryGroup {
  category: CatalogCategory
  label: string
  types: CatalogType[]
}

/**
 * Picker for adding new entities to the graph. Types are grouped by
 * the 6 Schema.org catalog categories. Clicking a type calls `onAdd`
 * with the type name and closes the picker.
 */
export function AddEntityPicker({ catalogTypes, onAdd }: AddEntityPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Focus the field as it mounts
  const focusOnMount = useCallback((input: HTMLInputElement | null): void => {
    input?.focus()
  }, [])

  if (!open) {
    return (
      <button type="button" className="graph-add-entity-btn" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add entity
      </button>
    )
  }

  const groups = groupByCategory(catalogTypes, search)

  return (
    <div className="graph-add-entity-picker">
      <div className="graph-add-entity-header">
        <input
          type="text"
          className="graph-input graph-input--text graph-add-entity-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search types…"
          ref={focusOnMount}
        />
        <button
          type="button"
          className="graph-add-entity-close"
          onClick={() => {
            setOpen(false)
            setSearch('')
          }}
          aria-label="Close picker"
        >
          <X size={16} />
        </button>
      </div>

      <div className="graph-add-entity-list">
        {groups.length === 0 && <p className="graph-add-entity-empty">No matching types.</p>}
        {groups.map((group) => (
          <div key={group.category} className="graph-add-entity-group">
            <div className="graph-add-entity-category">{group.label}</div>
            {group.types.map((ct) => (
              <button
                key={ct.type}
                type="button"
                className="graph-add-entity-type"
                onClick={() => {
                  onAdd(ct.type)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <span className="graph-add-entity-type-name">{ct.type}</span>
                <span className="graph-add-entity-type-desc">{ct.label}</span>
                {ct.richResult && <span className="graph-add-entity-rich-badge">Rich result</span>}
                {ct.lifecycle?.status === 'pending' && (
                  <span className="graph-add-entity-rich-badge">pending</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function groupByCategory(catalogTypes: readonly CatalogType[], search: string): CategoryGroup[] {
  const offered = catalogTypes.filter((ct) => isOffered(ct, false))
  const filtered = search
    ? offered.filter(
        (ct) =>
          ct.type.toLowerCase().includes(search.toLowerCase()) ||
          ct.label.toLowerCase().includes(search.toLowerCase()),
      )
    : offered

  const groups = new Map<CatalogCategory, CategoryGroup>()
  const categoryOrder: CatalogCategory[] = [
    'business',
    'content',
    'commerce',
    'people',
    'navigation',
    'reviews',
  ]

  for (const cat of categoryOrder) {
    groups.set(cat, { category: cat, label: CATEGORY_LABELS[cat], types: [] })
  }

  for (const ct of filtered) {
    const cat = ct.category as CatalogCategory
    const group = groups.get(cat)
    if (group) {
      group.types.push(ct)
    }
  }

  return [...groups.values()].filter((g) => g.types.length > 0)
}
