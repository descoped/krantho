import type { ReactElement } from 'react'
import type { MediaInfo } from '../lib/api.js'
import { formatSize } from '../lib/format.js'
import { filesText } from './media-model.js'

/** "Media", the store the files live in, and what it holds — as `GET /api/media/info` reports it */
export function MediaHeader({
  info,
  read,
}: {
  info: MediaInfo | null
  /** Whether the store's info was asked for yet */
  read: boolean
}): ReactElement {
  return (
    <header className="media-header">
      <h1 className="media-title">Media</h1>
      {info ? (
        <p className="media-lead">
          Stored in <strong className="media-store">{info.storageLabel}</strong>
          {info.storagePath && (
            <>
              {' '}
              at <code className="media-store-path">{info.storagePath}</code>
            </>
          )}
          <span>
            {' '}
            · {filesText(info.totalItems)}, {formatSize(info.totalSize)}
          </span>
        </p>
      ) : (
        <p className="media-lead">
          {read ? 'The media store could not be read.' : 'Reading the media store…'}
        </p>
      )}
    </header>
  )
}
