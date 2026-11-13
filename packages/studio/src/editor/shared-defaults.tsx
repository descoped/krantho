import { type ReactElement, useState } from 'react'
import { fetchCollectionItems, fetchCollections } from '../lib/api.js'
import { request } from '../lib/api-client.js'
import type { CollectionInfo, ContentSummaryItem } from '../lib/api-types.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { MetadataEditor } from './metadata-editor.js'
import type { Workspace } from './use-workspace.js'

interface DefaultsPreview {
  metadata: Record<string, Record<string, unknown>>
  paths: string[]
  version: number
  sourceVersion: number
}

/** Explicit materialization: review source values, then save one draft snapshot. */
export function SharedDefaults({ ws, slot }: { ws: Workspace; slot: string }): ReactElement | null {
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  const [items, setItems] = useState<ContentSummaryItem[]>([])
  const [collection, setCollection] = useState('')
  const [slug, setSlug] = useState('')
  const [preview, setPreview] = useState<DefaultsPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meta = ws.document?.meta
  const group = ws.schema.contract.metadata[slot]
  if (!meta || !group) return null
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Shared defaults could not be read'))
    } finally {
      setBusy(false)
    }
  }
  async function choose(name: string): Promise<void> {
    setCollection(name)
    setSlug('')
    setPreview(null)
    if (!name) {
      setItems([])
      return
    }
    const result = await fetchCollectionItems(name, { locale: meta?.locale })
    setItems(result.items)
  }
  async function review(apply: boolean): Promise<void> {
    if (!meta || ws.draft.dirty) return
    const result = await request<DefaultsPreview>(
      `/content/${encodeURIComponent(meta.collection)}/${encodeURIComponent(meta.slug)}/defaults`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceCollection: collection,
          slots: [slot],
          sourceSlug: slug,
          locale: meta.locale,
          apply,
          _version: preview?.version ?? meta.version,
          sourceVersion: preview?.sourceVersion,
        }),
      },
    )
    if (apply) {
      setPreview(null)
      await ws.reloadDocument()
    } else setPreview(result)
  }
  return (
    <details
      className="metadata-defaults"
      onToggle={(event) => {
        if (event.currentTarget.open && !collections.length)
          void run(async () => setCollections(await fetchCollections()))
      }}
    >
      <summary>Copy from another page</summary>
      <p>
        Review details to copy from a shared document. Saved snapshots keep their copied values.
      </p>
      {ws.draft.dirty && <p>Save your draft before applying shared defaults.</p>}
      <fieldset
        disabled={ws.readOnly || busy || ws.draft.dirty}
        className="metadata-defaults-fields"
      >
        <label>
          Source collection
          <select
            className="editor-control"
            value={collection}
            onChange={(event) => {
              void run(() => choose(event.target.value))
            }}
          >
            <option value="">Choose collection</option>
            {collections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source document
          <select
            className="editor-control"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          >
            <option value="">Choose document</option>
            {items.map((item) => (
              <option key={item.meta.slug} value={item.meta.slug}>
                {String(item.fields.title ?? item.meta.slug)}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={!slug}
          onClick={() => {
            void run(() => review(false))
          }}
        >
          Review defaults
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <Modal
          title="Review shared defaults"
          onClose={() => setPreview(null)}
          actions={
            <>
              <Button onClick={() => setPreview(null)}>Cancel</Button>
              <Button
                disabled={busy || ws.readOnly || ws.draft.dirty || !preview.paths.length}
                onClick={() => {
                  void run(() => review(true))
                }}
              >
                Apply to draft
              </Button>
            </>
          }
        >
          <p>
            {preview.paths.length
              ? `${preview.paths.length} ${preview.paths.length === 1 ? 'value' : 'values'} will be copied from snapshot v${preview.sourceVersion}. Your authored overrides stay.`
              : 'No missing or inherited values need updating.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <MetadataEditor
            contract={{
              ...ws.schema.contract,
              metadata: { [slot]: group },
            }}
            metadata={preview.metadata[slot] ? { [slot]: preview.metadata[slot] } : {}}
            fields={ws.draft.draft.fields}
            readOnly
            errors={{}}
            onMetadata={() => {}}
          />
        </Modal>
      )}
    </details>
  )
}
