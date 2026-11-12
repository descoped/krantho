import { Save, Undo2, Upload } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogDetailResponse, CatalogType, SeoConfigData } from '../../lib/api-types.js'
import {
  addEntity,
  applyBuffer,
  bufferToConfigUpdate,
  createBuffer,
  deleteEntity,
  type EditBuffer,
  isDirty,
  removeProperty,
  setProperty,
} from '../../lib/edit-buffer.js'
import {
  buildEkConfigMap,
  classifyGraphLayout,
  EDIT_KEY,
  type GraphModel,
  type GraphNode,
  typeString,
} from '../../lib/jsonld-graph.js'
import { AddEntityPicker } from './AddEntityPicker.js'
import { EntityCard } from './EntityCard.js'
import { ExportDropdown } from './ExportDropdown.js'
import { GraphSection } from './GraphSection.js'
import { GraphSummary } from './GraphSummary.js'
import { ImportModal } from './ImportModal.js'
import { LayoutToggle, useGraphLayout } from './LayoutToggle.js'
import { PropertyPanel } from './PropertyPanel.js'
import { RawJsonToggle } from './RawJsonToggle.js'
import './graph-browser.css'

// Lazy-load canvas view — only loaded when user switches to canvas
const LazyGraphCanvas = lazy(() =>
  import('./GraphCanvas.js').then((m) => ({ default: m.GraphCanvas })),
)

interface GraphBrowserProps {
  saveLabel?: string | undefined
  model: GraphModel
  catalogTypes: readonly CatalogType[]
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>
  /** The raw JSON-LD object, used by the "Show raw JSON" fallback toggle and export. */
  rawData: unknown
  /** Edit mode: current config data from the server. */
  configData?: SeoConfigData | undefined
  /** Edit mode: called to save the updated config. */
  onSave?: ((config: SeoConfigData) => Promise<void>) | undefined
  /** Set of site-level types (for scope propagation detection). */
  siteLevelTypeSet?: ReadonlySet<string> | undefined
  /** Collection name — used for export filename. */
  collection?: string | undefined
  /** Document slug — used for export filename. */
  slug?: string | undefined
}

/**
 * Top-level container for the structural JSON-LD graph browser.
 *
 * Owns the parsed model (prop), the derived layout, the current selection,
 * the edit buffer (when in edit mode), and the transient focus-target
 * highlight state.
 *
 * Edit mode is activated when `configData` and `onSave` are provided.
 * In edit mode, the header gains Discard, Import and Save, and all properties
 * become editable. Changes accumulate in the edit buffer and are only
 * persisted when the user clicks Save.
 */
export function GraphBrowser({
  saveLabel = 'Save',
  model: serverModel,
  catalogTypes,
  catalogDetails,
  rawData,
  configData,
  onSave,
  siteLevelTypeSet,
  collection,
  slug,
}: GraphBrowserProps): React.ReactElement {
  const editing = configData !== undefined && onSave !== undefined

  // Layout toggle (tree vs canvas)
  const [graphLayout, setGraphLayout] = useGraphLayout()

  // Import modal state
  const [showImport, setShowImport] = useState(false)

  // Edit buffer state
  const [buffer, setBuffer] = useState<EditBuffer>(createBuffer)
  const [saving, setSaving] = useState(false)
  const dirty = isDirty(buffer)

  // Apply buffer to model for live preview
  const model = useMemo(
    () => (dirty ? applyBuffer(serverModel, buffer) : serverModel),
    [serverModel, buffer, dirty],
  )

  // Derived data for import modal
  const currentEntityTypes = useMemo(() => {
    const set = new Set<string>()
    for (const node of model.nodes) {
      const type = typeString(node['@type'])
      if (type) set.add(type)
    }
    return set
  }, [model])

  const catalogPropertySets = useMemo(() => {
    const map = new Map<string, ReadonlySet<string>>()
    for (const [type, detail] of catalogDetails) {
      map.set(type, new Set(detail.properties.map((p) => p.property)))
    }
    return map
  }, [catalogDetails])

  const siteLevelTypes = useMemo(() => {
    if (siteLevelTypeSet) return siteLevelTypeSet
    const set = new Set<string>()
    for (const t of catalogTypes) {
      if (t.siteLevel) set.add(t.type)
    }
    return set
  }, [catalogTypes, siteLevelTypeSet])

  const layout = useMemo(() => classifyGraphLayout(model, siteLevelTypes), [model, siteLevelTypes])

  const flatNodes = useMemo(() => {
    const flat: GraphNode[] = []
    flat.push(...layout.siteContext)
    if (layout.page) flat.push(layout.page)
    if (layout.primary) flat.push(layout.primary)
    flat.push(...layout.linked)
    return flat
  }, [layout])

  // Selection state — uses _ek (edit key), not @id. Every node has _ek
  // after parseGraph(). Selection is always via model.byEk lookup.
  const [selectedEk, setSelectedEk] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Scope propagation for site-level entity edits
  const [propagationScope, setPropagationScope] = useState<'document' | 'site'>('site')

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current)
      }
    }
  }, [])

  // Navigation guard: warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Edit key → config entity mapping (built once, used at save time)
  const ekConfigMap = useMemo(
    () =>
      configData ? buildEkConfigMap(model.nodes, configData.entities) : new Map<string, number>(),
    [model, configData],
  )

  // Selected node resolution — via _ek lookup in model.byEk
  const selectedNode = useMemo<GraphNode | null>(() => {
    if (selectedEk !== null) {
      const hit = model.byEk.get(selectedEk)
      if (hit) return hit
    }
    return layout.primary ?? flatNodes[0] ?? null
  }, [selectedEk, model, layout.primary, flatNodes])

  const effectiveSelectedEk = selectedNode?.[EDIT_KEY] ?? null

  // Is the selected entity site-level?
  const selectedIsSiteLevel = useMemo(() => {
    if (!selectedNode) return false
    const type = typeString(selectedNode['@type'])
    return type !== null && siteLevelTypes.has(type)
  }, [selectedNode, siteLevelTypes])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelect = useCallback((node: GraphNode) => {
    const ek = node[EDIT_KEY]
    if (typeof ek === 'string') {
      setSelectedEk(ek)
    }
  }, [])

  const handleFollowReference = useCallback(
    (referenceId: string) => {
      const target = model.byId.get(referenceId)
      if (!target) return
      const targetEk = target[EDIT_KEY]
      if (typeof targetEk === 'string') setSelectedEk(targetEk)
      setFocusedId(referenceId)

      if (containerRef.current) {
        const card = containerRef.current.querySelector<HTMLElement>(
          `[data-entity-id="${cssEscape(referenceId)}"]`,
        )
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current)
      }
      focusTimerRef.current = setTimeout(() => setFocusedId(null), 1200)
    },
    [model],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (flatNodes.length === 0) return
      const currentIndex = flatNodes.findIndex((n) => n[EDIT_KEY] === effectiveSelectedEk)
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = flatNodes[Math.min(currentIndex + 1, flatNodes.length - 1)]
        if (next) handleSelect(next)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = flatNodes[Math.max(currentIndex - 1, 0)]
        if (prev) handleSelect(prev)
      }
    },
    [flatNodes, effectiveSelectedEk, handleSelect],
  )

  // Edit buffer operations
  const handlePropertyChange = useCallback(
    (entityKeyStr: string, property: string, value: unknown) => {
      setBuffer((prev) => setProperty(prev, entityKeyStr, property, value))
    },
    [],
  )

  const handlePropertyRemove = useCallback((entityKeyStr: string, property: string) => {
    setBuffer((prev) => removeProperty(prev, entityKeyStr, property))
  }, [])

  const handleDeleteEntity = useCallback((key: string) => {
    setBuffer((prev) => deleteEntity(prev, key))
  }, [])

  const handleAddEntity = useCallback((type: string) => {
    setBuffer((prev) => addEntity(prev, { '@type': type, properties: {} }))
  }, [])

  const handleDiscard = useCallback(() => {
    setBuffer(createBuffer())
  }, [])

  const handleSave = useCallback(async () => {
    if (!onSave || !configData || !dirty) return
    setSaving(true)
    try {
      const update = bufferToConfigUpdate(buffer, configData, ekConfigMap)
      await onSave(update)
      setBuffer(createBuffer())
    } finally {
      setSaving(false)
    }
  }, [onSave, configData, buffer, dirty, ekConfigMap])

  // Cmd/Ctrl+S shortcut — placed after handleSave to avoid TDZ
  useEffect(() => {
    if (!editing) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) {
          void handleSave()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, dirty, saving, handleSave])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const renderCard = useCallback(
    (node: GraphNode, initiallyExpanded: boolean, index: number): React.ReactElement => {
      const ek = node[EDIT_KEY] ?? `node-${index}`
      const type = typeString(node['@type'])
      const detail = type !== null ? (catalogDetails.get(type) ?? null) : null
      return (
        <EntityCard
          key={ek}
          node={node}
          catalogTypes={catalogTypes}
          catalogDetail={detail}
          selected={effectiveSelectedEk === ek}
          focused={focusedId === node['@id']}
          onSelect={handleSelect}
          onFollowReference={handleFollowReference}
          initiallyExpanded={initiallyExpanded}
        />
      )
    },
    [
      catalogDetails,
      catalogTypes,
      focusedId,
      handleFollowReference,
      handleSelect,
      effectiveSelectedEk,
    ],
  )

  if (model.nodes.length === 0 && !editing) {
    return (
      <div className="graph-browser graph-browser--empty">
        <p className="graph-browser-empty-message">
          This document has no composed JSON-LD graph yet. Configure a Schema.org archetype for the
          collection or document to see structured data here.
        </p>
        <RawJsonToggle data={rawData} />
      </div>
    )
  }

  const propertyPanel = (
    <PropertyPanel
      node={selectedNode}
      model={model}
      catalogTypes={catalogTypes}
      catalogDetails={catalogDetails}
      onFollowReference={handleFollowReference}
      onPropertyChange={editing ? handlePropertyChange : undefined}
      onPropertyRemove={editing ? handlePropertyRemove : undefined}
      onDeleteEntity={editing ? handleDeleteEntity : undefined}
      isSiteLevel={selectedIsSiteLevel}
      propagationScope={selectedIsSiteLevel ? propagationScope : undefined}
      onPropagationChange={selectedIsSiteLevel ? setPropagationScope : undefined}
    />
  )

  return (
    <div
      className="graph-browser"
      ref={containerRef}
      role="tree"
      aria-label="JSON-LD graph browser"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="graph-browser-header">
        <GraphSummary
          model={model}
          layout={layout}
          catalogTypes={catalogTypes}
          catalogDetails={catalogDetails}
        />
        <div className="graph-browser-header-actions">
          {editing && (
            <button
              type="button"
              className="graph-header-btn graph-header-btn--discard"
              onClick={handleDiscard}
              disabled={!dirty || saving}
            >
              <Undo2 size={14} /> Discard
            </button>
          )}
          <LayoutToggle value={graphLayout} onChange={setGraphLayout} />
          {editing && (
            <button type="button" className="graph-header-btn" onClick={() => setShowImport(true)}>
              <Upload size={14} /> Import
            </button>
          )}
          <ExportDropdown data={rawData} collection={collection} slug={slug} />
          {editing && (
            <button
              type="button"
              className="graph-header-btn graph-header-btn--save"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              <Save size={14} /> {saving ? `${saveLabel}…` : saveLabel}
            </button>
          )}
        </div>
      </div>

      <div className="graph-browser-body">
        {graphLayout === 'tree' ? (
          <>
            <div className="graph-browser-tree">
              {layout.siteContext.length > 0 && (
                <GraphSection label="Site Context" variant="site">
                  {layout.siteContext.map((n, i) => renderCard(n, false, i))}
                  {editing && (
                    <AddEntityPicker
                      catalogTypes={catalogTypes.filter((t) => t.siteLevel)}
                      onAdd={handleAddEntity}
                    />
                  )}
                </GraphSection>
              )}

              {layout.page && (
                <GraphSection label="Page" variant="page">
                  {renderCard(layout.page, false, 0)}
                </GraphSection>
              )}

              {(layout.primary || editing) && (
                <GraphSection label="Primary Entity" variant="primary">
                  {layout.primary && renderCard(layout.primary, true, 0)}
                  {layout.linked.map((n, i) => renderCard(n, false, i + 1))}
                  {editing && (
                    <AddEntityPicker
                      catalogTypes={catalogTypes.filter((t) => t.documentLevel)}
                      onAdd={handleAddEntity}
                    />
                  )}
                </GraphSection>
              )}
            </div>

            {propertyPanel}
          </>
        ) : (
          <>
            <Suspense fallback={<div className="graph-canvas-loading">Loading canvas…</div>}>
              <LazyGraphCanvas
                model={model}
                catalogTypes={catalogTypes}
                catalogDetails={catalogDetails}
                selectedEk={effectiveSelectedEk}
                onSelect={handleSelect}
              />
            </Suspense>

            {propertyPanel}
          </>
        )}
      </div>

      <RawJsonToggle data={rawData} />

      {showImport && (
        <ImportModal
          currentModel={model}
          currentEntityTypes={currentEntityTypes}
          catalogPropertySets={catalogPropertySets}
          baseUrl={typeof window !== 'undefined' ? window.location.origin : ''}
          buffer={buffer}
          onApply={(newBuffer) => setBuffer(newBuffer)}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function cssEscape(value: string): string {
  if (
    typeof (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === 'function'
  ) {
    return (globalThis as { CSS: { escape: (s: string) => string } }).CSS.escape(value)
  }
  // Fallback: escape all non-alphanumeric, non-hyphen, non-underscore characters
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
