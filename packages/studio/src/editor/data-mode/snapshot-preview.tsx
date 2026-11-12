import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { type ReactElement, useCallback } from 'react'
import { fetchVersion } from '../../lib/api.js'
import { formatShortDateTime } from '../../lib/format.js'
import { useLoaded } from '../../site/use-loaded.js'
import { Button } from '../../ui/button.js'
import { Modal } from '../../ui/modal.js'
import { MetadataEditor } from '../metadata-editor.js'

/** A sanitized, read-only snapshot: its fields and body, never the editable draft. */
export function SnapshotPreview(props: {
  collection: string
  slug: string
  locale: string
  version: number
  onClose: () => void
}): ReactElement {
  const { collection, slug, locale, version } = props
  const load = useCallback(async () => {
    const snapshot = await fetchVersion(collection, slug, version, locale)
    const html = DOMPurify.sanitize(await marked.parse(snapshot.body))
    return { ...snapshot, html }
  }, [collection, slug, locale, version])
  const { loaded, reload } = useLoaded(load, 'This snapshot could not be read')
  return (
    <Modal
      title={`Snapshot v${version}`}
      onClose={props.onClose}
      actions={<Button onClick={props.onClose}>Close</Button>}
    >
      <p className="snapshot-preview-note">Read-only snapshot. Your draft is unchanged.</p>
      {loaded.state === 'loading' && <p role="status">Reading the snapshot…</p>}
      {loaded.state === 'error' && (
        <div role="alert">
          <p>{loaded.message}</p>
          <Button onClick={reload}>Retry</Button>
        </div>
      )}
      {loaded.state === 'ready' && (
        <>
          <time dateTime={loaded.data.createdAt}>{formatShortDateTime(loaded.data.createdAt)}</time>
          <details className="snapshot-fields">
            <summary>Fields</summary>
            <pre>{JSON.stringify(loaded.data.fields, null, 2)}</pre>
          </details>
          {loaded.data.contract && (
            <MetadataEditor
              contract={loaded.data.contract}
              metadata={loaded.data.metadata}
              fields={loaded.data.fields}
              defaults={loaded.data.defaults}
              readOnly
              errors={{}}
              onMetadata={() => {}}
            />
          )}
          {typeof loaded.data.fields.title === 'string' && <h3>{loaded.data.fields.title}</h3>}
          <article
            className="snapshot-body"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
            dangerouslySetInnerHTML={{ __html: loaded.data.html }}
          />
        </>
      )}
    </Modal>
  )
}
