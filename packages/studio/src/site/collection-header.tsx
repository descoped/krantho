import { collectionBasePath } from '@krantho/core/cache-tags'
import { Download, Plus, Upload } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { type TimedMessage, useTimedMessage } from '../hooks/use-timed-message.js'
import { exportCollection } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { downloadFile } from '../lib/export-helpers.js'
import { errorMessage } from '../lib/fetch.js'
import { collectionLabel, singularLabel } from '../lib/format.js'
import { newDocumentPath } from '../lib/paths.js'
import { Button, buttonClass } from '../ui/button.js'
import type { CollectionViewData } from './site-sources.js'
import { exportFilename } from './transfer.js'

/** Export downloads the collection in the chosen locale as JSON, and says how it went */
export function useExport(
  name: string,
  locale: string | null,
): { notice: TimedMessage | null; run: () => Promise<void> } {
  const { message, showSuccess, showError } = useTimedMessage(4000)
  async function run(): Promise<void> {
    if (!locale) return
    try {
      const result = await exportCollection(name, 'json', locale)
      downloadFile(
        JSON.stringify(result, null, 2),
        exportFilename(name, locale),
        'application/json',
      )
      showSuccess(`Exported ${result.count === 1 ? '1 document' : `${result.count} documents`}`)
    } catch (err: unknown) {
      showError(errorMessage(err, 'Export failed'))
    }
  }
  return { notice: message, run }
}

export interface CollectionHeaderProps {
  name: string
  /** Null until the collection has loaded */
  data: CollectionViewData | null
  /** The last export's result, announced politely */
  notice: TimedMessage | null
  onExport: () => void
  onImport: () => void
}

function Actions({ name, notice, onExport, onImport }: CollectionHeaderProps): ReactElement {
  const { hasRole } = useAuth()
  return (
    <div className="site-header-actions">
      <p
        className={notice ? `site-notice site-notice--${notice.kind}` : 'site-notice'}
        role="status"
      >
        {notice?.text}
      </p>
      <Button icon={Download} onClick={onExport}>
        Export
      </Button>
      {hasRole('editor') && (
        <Button icon={Upload} onClick={onImport}>
          Import
        </Button>
      )}
      {hasRole('editor') && (
        <Link to={newDocumentPath(name)} className={buttonClass('primary')}>
          <Plus className="ui-button-icon" aria-hidden="true" />
          New {singularLabel(name)}
        </Link>
      )}
    </div>
  )
}

/** The collection's name, where its pages live and the locale shown, with Export, Import and New */
export function CollectionHeader(props: CollectionHeaderProps): ReactElement {
  const { name, data } = props
  const pattern = data?.collection ? collectionBasePath(data.collection) : null
  return (
    <header className="site-header site-header--row">
      <div>
        <h1 className="site-heading">{collectionLabel(name)}</h1>
        <p className="site-lede">
          {pattern ? <code>{pattern}</code> : 'No pages of its own'}
          {data && (
            <>
              {' '}
              · in <code>{data.locale}</code>
            </>
          )}
        </p>
      </div>
      {data && <Actions {...props} />}
    </header>
  )
}
