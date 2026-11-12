import { Copy } from 'lucide-react'
import { type ReactElement, useCallback } from 'react'
import { exportSchemaCode } from '../lib/api.js'
import { collectionLabel } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { useToast } from '../ui/toast.js'
import { LoadError, Loading } from './setup-section.js'

/** Copy the code, saying whether the browser allowed it */
function useCopy(code: string | null): () => Promise<void> {
  const toast = useToast()
  return async () => {
    if (code === null) return
    try {
      await navigator.clipboard.writeText(code)
      toast({ text: 'Copied the Zod schema.' })
    } catch {
      toast({ text: 'The browser did not allow copying; select the code instead.', tone: 'error' })
    }
  }
}

interface ZodExportProps {
  collection: string
  onClose: () => void
}

/**
 * Export as Zod: the collection's schema — its code fields and its runtime
 * fields — as Zod code (`GET /api/schema/:collection/export`), to copy into
 * `krantho.collections.ts` so the runtime fields become code fields
 */
export function ZodExportModal({ collection, onClose }: ZodExportProps): ReactElement {
  const load = useCallback(async () => (await exportSchemaCode(collection)).code, [collection])
  const { loaded, reload } = useLoaded(load, 'The schema could not be exported')
  const code = loaded.state === 'ready' ? loaded.data : null
  const copy = useCopy(code)
  const actions = (
    <>
      <Button onClick={onClose}>Close</Button>
      <Button
        variant="primary"
        icon={Copy}
        aria-disabled={code === null}
        onClick={() => void copy()}
      >
        Copy
      </Button>
    </>
  )
  return (
    <Modal title={`${collectionLabel(collection)} as Zod`} onClose={onClose} actions={actions}>
      <p className="setup-note">
        The code fields and the runtime fields as one Zod schema. Paste it into{' '}
        <code>krantho.collections.ts</code> to make the runtime fields part of the code; code always
        wins over a runtime field of the same name.
      </p>
      {loaded.state === 'loading' && <Loading what="the schema" />}
      {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
      {code !== null && (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region is reachable by keyboard
        <section className="setup-code" aria-label="Zod schema" tabIndex={0}>
          <pre>
            <code>{code}</code>
          </pre>
        </section>
      )}
    </Modal>
  )
}
