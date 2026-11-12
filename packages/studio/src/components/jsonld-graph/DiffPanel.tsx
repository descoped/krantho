import { AlertTriangle, Check, Minus, Plus } from 'lucide-react'
import type { EntityDiff, PropertyChange } from '../../lib/import-diff.js'

interface DiffPanelProps {
  entities: readonly EntityDiff[]
  selectedProperties: ReadonlySet<string>
  onToggle: (key: string) => void
}

/**
 * Per-entity grouped diff display with checkboxes for selective apply.
 * Each property change is independently selectable unless the parent
 * entity is disabled (unknown type).
 */
export function DiffPanel({
  entities,
  selectedProperties,
  onToggle,
}: DiffPanelProps): React.ReactElement {
  if (entities.length === 0) {
    return <p className="import-diff-empty">No changes detected.</p>
  }

  return (
    <div className="import-diff-panel">
      {entities.map((entity) => (
        <div
          key={`${entity.type}-${entity.role ?? ''}`}
          className={`import-diff-entity ${entity.disabled ? 'import-diff-entity--disabled' : ''}`}
        >
          <div className="import-diff-entity-header">
            <span className="import-diff-entity-type">{entity.type}</span>
            {entity.role && <span className="import-diff-entity-role">{entity.role}</span>}
            {entity.disabled && (
              <span className="import-diff-entity-badge import-diff-entity-badge--disabled">
                Disabled
              </span>
            )}
            <span className="import-diff-entity-count">
              {entity.changes.length} change{entity.changes.length === 1 ? '' : 's'}
            </span>
          </div>

          {entity.disabled && entity.disabledReason && (
            <p className="import-diff-disabled-reason">{entity.disabledReason}</p>
          )}

          <div className="import-diff-changes">
            {entity.changes.map((change) => {
              const key = changeKey(entity, change)
              const checked = selectedProperties.has(key)
              const canCheck = !entity.disabled && change.kind !== 'removed'

              return (
                <label
                  key={key}
                  className={`import-diff-change import-diff-change--${change.kind}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canCheck}
                    onChange={() => onToggle(key)}
                    className="import-diff-checkbox"
                  />
                  <div className="import-diff-change-content">
                    <div className="import-diff-change-header">
                      <ChangeIcon kind={change.kind} />
                      <span className="import-diff-property">{change.property}</span>
                      {change.unknownProperty && (
                        <span className="import-diff-warning">
                          <AlertTriangle size={12} /> Unknown property
                        </span>
                      )}
                    </div>
                    <div className="import-diff-change-values">
                      {change.kind === 'changed' && (
                        <>
                          <span className="import-diff-old-value">
                            {formatValue(change.oldValue)}
                          </span>
                          <span className="import-diff-arrow">→</span>
                          <span className="import-diff-new-value">
                            {formatValue(change.newValue)}
                          </span>
                        </>
                      )}
                      {change.kind === 'added' && (
                        <span className="import-diff-new-value">
                          {formatValue(change.newValue)}
                        </span>
                      )}
                      {change.kind === 'removed' && (
                        <span className="import-diff-removed-value">
                          {formatValue(change.oldValue)}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Generate a stable key for a property change. */
export function changeKey(entity: EntityDiff, change: PropertyChange): string {
  return `${entity.type}:${entity.role ?? ''}:${change.property}`
}

function ChangeIcon({ kind }: { kind: 'added' | 'changed' | 'removed' }): React.ReactElement {
  switch (kind) {
    case 'added':
      return <Plus size={14} className="import-diff-icon import-diff-icon--added" />
    case 'changed':
      return <Check size={14} className="import-diff-icon import-diff-icon--changed" />
    case 'removed':
      return <Minus size={14} className="import-diff-icon import-diff-icon--removed" />
    default:
      return <Check size={14} />
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > 80 ? `${json.slice(0, 77)}…` : json
  }
  return String(value)
}
