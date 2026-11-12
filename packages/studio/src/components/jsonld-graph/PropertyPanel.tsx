import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CatalogDetailResponse, CatalogType } from '../../lib/api-types.js'
import { nodeKey } from '../../lib/edit-buffer.js'
import {
  CATEGORY_LABELS,
  classifyNodeProperties,
  EDIT_KEY,
  entityCategory,
  type GraphModel,
  type GraphNode,
  orderedProperties,
  typeString,
} from '../../lib/jsonld-graph.js'
import { CategoryBadge } from './CategoryBadge.js'
import { PropertyRow } from './PropertyRow.js'
import { ReferencesList } from './ReferencesList.js'
import { ScopePropagation } from './ScopePropagation.js'
import { ValidationMeter } from './ValidationMeter.js'
import './property-panel.css'

interface PropertyPanelProps {
  node: GraphNode | null
  model: GraphModel
  catalogTypes: readonly CatalogType[]
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>
  onFollowReference: (referenceId: string) => void
  /** Edit mode callbacks — when provided, properties become editable. */
  onPropertyChange?: ((entityKey: string, property: string, value: unknown) => void) | undefined
  onPropertyRemove?: ((entityKey: string, property: string) => void) | undefined
  onDeleteEntity?: ((entityKey: string) => void) | undefined
  /** Whether the selected entity is site-level (for scope propagation). */
  isSiteLevel?: boolean | undefined
  /** Scope propagation state. */
  propagationScope?: 'document' | 'site' | undefined
  onPropagationChange?: ((scope: 'document' | 'site') => void) | undefined
}

interface RichResultInfo {
  reader: string
  feature: string
  status: string
  source: string
}

/**
 * Side panel showing entity details and properties.
 * In read mode: displays values.
 * In edit mode (when onPropertyChange is provided): renders type-aware inputs.
 */
export function PropertyPanel({
  node,
  model,
  catalogTypes,
  catalogDetails,
  onFollowReference,
  onPropertyChange,
  onPropertyRemove,
  onDeleteEntity,
  isSiteLevel,
  propagationScope,
  onPropagationChange,
}: PropertyPanelProps): React.ReactElement {
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = onPropertyChange !== undefined

  // Reset transient UI state when selected entity changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: the node is the trigger, the effect reads only setters
  useEffect(() => {
    setShowAddPicker(false)
    setConfirmDelete(false)
  }, [node])

  if (node === null) {
    return (
      <aside className="graph-property-panel graph-property-panel--empty">
        <p className="graph-property-panel-hint">Select an entity to see its details.</p>
      </aside>
    )
  }

  const type = typeString(node['@type']) ?? 'Unknown'
  const category = entityCategory(node, catalogTypes)
  const detail = catalogDetails.get(type) ?? null
  const classifications = classifyNodeProperties(node, detail)
  const ordered = orderedProperties(classifications)
  const richResults = extractRichResultInfo(detail)
  const inboundRefs = node['@id'] ? (model.referencedBy.get(node['@id']) ?? []) : []

  // Catalog properties not already present on the node (for "Add property" picker).
  // A property is "present" if it exists as a key on the node object — regardless
  // of whether its value is empty. This avoids showing properties in both the
  // property list and the add picker simultaneously.
  const nodePropertyKeys = new Set(
    Object.keys(node).filter(
      (k) => k !== '@type' && k !== '@id' && k !== '@context' && k !== EDIT_KEY,
    ),
  )
  const unsetProperties = detail
    ? detail.properties.filter((p) => !nodePropertyKeys.has(p.property))
    : []

  const entityKeyStr = nodeKey(node)

  return (
    <aside className="graph-property-panel">
      <header className="graph-property-panel-header">
        <div className="graph-property-panel-title-row">
          <h3 className="graph-property-panel-title">{type}</h3>
          <CategoryBadge category={category} />
          {editing && onDeleteEntity && !confirmDelete && (
            <button
              type="button"
              className="graph-property-panel-delete"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${type} entity`}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
          {editing && onDeleteEntity && confirmDelete && (
            <span className="graph-property-panel-delete-confirm">
              <button
                type="button"
                className="graph-property-panel-delete graph-property-panel-delete--confirm"
                onClick={() => {
                  onDeleteEntity(entityKeyStr)
                  setConfirmDelete(false)
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="graph-property-panel-delete-cancel"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </span>
          )}
        </div>
        {category && (
          <p className="graph-property-panel-category-label">{CATEGORY_LABELS[category]}</p>
        )}
        {richResults.map((result) => (
          <div key={result.reader} className="graph-property-panel-rich-result">
            <span className="graph-property-panel-rich-result-label">{result.reader}:</span>{' '}
            <strong>{result.feature}</strong>
            {result.status !== 'active' && ` (${result.status})`}
            <a
              href={result.source}
              target="_blank"
              rel="noopener noreferrer"
              className="graph-property-panel-docs-link"
            >
              Docs <ExternalLink size={12} />
            </a>
          </div>
        ))}
        <ValidationMeter classifications={classifications} />
        {editing && isSiteLevel && propagationScope && onPropagationChange && (
          <ScopePropagation value={propagationScope} onChange={onPropagationChange} />
        )}
      </header>

      <section className="graph-property-panel-section">
        <h4 className="graph-property-panel-section-label">Properties</h4>
        {ordered.length === 0 ? (
          <p className="graph-property-panel-empty">No catalog properties available.</p>
        ) : (
          <div className="graph-property-list">
            {ordered.map((c) => (
              <PropertyRow
                key={c.property}
                classification={c}
                onFollowReference={onFollowReference}
                onValueChange={
                  editing ? (prop, val) => onPropertyChange(entityKeyStr, prop, val) : undefined
                }
                onRemove={
                  editing && onPropertyRemove
                    ? (prop) => onPropertyRemove(entityKeyStr, prop)
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/* Add property picker */}
        {editing && unsetProperties.length > 0 && (
          <div className="graph-property-add">
            {showAddPicker ? (
              <div className="graph-property-add-picker">
                {unsetProperties.map((p) => (
                  <button
                    key={p.property}
                    type="button"
                    className="graph-property-add-option"
                    onClick={() => {
                      onPropertyChange(entityKeyStr, p.property, '')
                      setShowAddPicker(false)
                    }}
                  >
                    <span className="graph-property-add-option-name">{p.label}</span>
                    <span
                      className={`graph-property-add-option-importance graph-property-add-option-importance--${p.importance}`}
                    >
                      {p.importance}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="graph-property-add-cancel"
                  onClick={() => setShowAddPicker(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="graph-property-add-btn"
                onClick={() => setShowAddPicker(true)}
              >
                <Plus size={14} /> Add property
              </button>
            )}
          </div>
        )}
      </section>

      <section className="graph-property-panel-section">
        <h4 className="graph-property-panel-section-label">Referenced by</h4>
        <ReferencesList references={inboundRefs} onFollow={onFollowReference} />
      </section>
    </aside>
  )
}

/** The search features each active reader offers for the type, with the documentation they cite */
function extractRichResultInfo(detail: CatalogDetailResponse | null): RichResultInfo[] {
  return (detail?.rules ?? []).flatMap((rule) =>
    rule.feature
      ? [
          {
            reader: rule.readerName,
            feature: rule.feature,
            status: rule.status,
            source: rule.source,
          },
        ]
      : [],
  )
}
