import { Upload } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/use-focus-trap.js'
import type { EditBuffer } from '../../lib/edit-buffer.js'
import {
  applySelectedChanges,
  buildIdMap,
  type ImportDiff,
  parseAndDiff,
  type SelectedChange,
} from '../../lib/import-diff.js'
import type { GraphModel } from '../../lib/jsonld-graph.js'
import { changeKey, DiffPanel } from './DiffPanel.js'
import './import-modal.css'

interface ImportModalProps {
  currentModel: GraphModel
  currentEntityTypes: ReadonlySet<string>
  catalogPropertySets: ReadonlyMap<string, ReadonlySet<string>>
  baseUrl: string
  buffer: EditBuffer
  onApply: (newBuffer: EditBuffer) => void
  onClose: () => void
}

/**
 * Modal for importing external JSON-LD into the current document.
 *
 * Flow: paste → parse → review diff → select changes → apply to buffer.
 * The modal never saves directly — changes go into the edit buffer for
 * the user to review and explicitly save.
 */
export function ImportModal({
  currentModel,
  currentEntityTypes,
  catalogPropertySets,
  baseUrl,
  buffer,
  onApply,
  onClose,
}: ImportModalProps): React.ReactElement {
  const [jsonText, setJsonText] = useState('')
  const [diff, setDiff] = useState<ImportDiff | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(dialogRef, true)

  // Handle Escape key to close modal
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleParse = useCallback(() => {
    const result = parseAndDiff(jsonText, currentModel, currentEntityTypes, catalogPropertySets)
    setDiff(result)

    if (!result.error) {
      // Auto-select all non-disabled, non-removed changes
      const autoSelected = new Set<string>()
      for (const entity of result.entities) {
        if (entity.disabled) continue
        for (const change of entity.changes) {
          if (change.kind !== 'removed') {
            autoSelected.add(changeKey(entity, change))
          }
        }
      }
      setSelected(autoSelected)
    }
  }, [jsonText, currentModel, currentEntityTypes, catalogPropertySets])

  const handleToggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleApply = useCallback(() => {
    if (!diff?.importedModel) return

    // Build the list of selected changes, resolving @id from the current
    // graph so the edit buffer keys match the @id-based entity identity.
    const changes: SelectedChange[] = []
    for (const entity of diff.entities) {
      if (entity.disabled) continue
      // Find the current graph node's @id for this entity type+role
      const currentNode = currentModel.nodes.find((n) => {
        const t = typeof n['@type'] === 'string' ? n['@type'] : undefined
        return t === entity.type && (!entity.role || n.role === entity.role)
      })
      const entityId = typeof currentNode?.['@id'] === 'string' ? currentNode['@id'] : undefined
      for (const change of entity.changes) {
        const key = changeKey(entity, change)
        if (!selected.has(key)) continue
        if (change.kind === 'removed') continue
        changes.push({
          entityType: change.entityType,
          entityRole: change.entityRole,
          entityId,
          property: change.property,
          value: change.newValue,
          kind: change.kind,
        })
      }
    }

    if (changes.length === 0) {
      onClose()
      return
    }

    // Build @id rewrite map from the parsed model returned by parseAndDiff
    const idMap = buildIdMap(diff.importedModel, currentModel, baseUrl)

    // Apply to buffer
    const newBuffer = applySelectedChanges(buffer, changes, idMap)
    onApply(newBuffer)
    onClose()
  }, [diff, selected, currentModel, baseUrl, buffer, onApply, onClose])

  const canApply =
    diff !== null && !diff.error && selected.size > 0 && (!diff.requiresConfirmation || confirmed)

  return (
    <div className="import-modal-overlay">
      <div className="import-modal-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="import-modal-header">
          <h2 id={titleId} className="import-modal-title">
            <Upload size={18} /> Import JSON-LD
          </h2>
          <button type="button" className="import-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="import-modal-body">
          {!diff ? (
            <>
              <p className="import-modal-hint">
                Paste a JSON-LD blob to import entities and properties into this document. Changes
                will be reviewed before applying.
              </p>
              <textarea
                className="import-modal-textarea"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{"@context": "https://schema.org", "@graph": [...]}'
                rows={12}
              />
            </>
          ) : diff.error ? (
            <div className="import-modal-error">
              <p>{diff.error}</p>
              <button
                type="button"
                className="import-modal-btn import-modal-btn--secondary"
                onClick={() => setDiff(null)}
              >
                Edit JSON
              </button>
            </div>
          ) : (
            <>
              <div className="import-modal-summary">
                {diff.totalPropertyChanges} property change
                {diff.totalPropertyChanges === 1 ? '' : 's'} across {diff.entities.length} entit
                {diff.entities.length === 1 ? 'y' : 'ies'}
                {diff.totalEntityAdditions > 0 &&
                  ` (${diff.totalEntityAdditions} new entit${diff.totalEntityAdditions === 1 ? 'y' : 'ies'})`}
              </div>

              <DiffPanel
                entities={diff.entities}
                selectedProperties={selected}
                onToggle={handleToggle}
              />

              {diff.requiresConfirmation && (
                <label className="import-modal-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I&apos;ve reviewed these changes
                </label>
              )}
            </>
          )}
        </div>

        <div className="import-modal-footer">
          <button
            type="button"
            className="import-modal-btn import-modal-btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          {!diff ? (
            <button
              type="button"
              className="import-modal-btn import-modal-btn--primary"
              onClick={handleParse}
              disabled={!jsonText.trim()}
            >
              Parse
            </button>
          ) : !diff.error ? (
            <button
              type="button"
              className="import-modal-btn import-modal-btn--primary"
              onClick={handleApply}
              disabled={!canApply}
            >
              Apply {selected.size} change{selected.size === 1 ? '' : 's'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
