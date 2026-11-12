import { type ReactElement, useEffect, useRef, useState } from 'react'
import type { PublishImpact } from '../lib/api.js'
import { fetchPublishImpact } from '../lib/api.js'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { collectionLabel } from '../lib/format.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { publishLead, publishTitle, type SavedVersions } from './header-model.js'
import { PublishFindingsSection, usePublishFindings } from './publish-findings.js'

/** What publishing would refresh, as read from the API */
type Impact = { state: 'loading' } | { state: 'error' } | { state: 'ready'; impact: PublishImpact }

/** What publishing the document in its locale would refresh (`GET …/publish-impact`) */
export function usePublishImpact(collection: string, slug: string, locale: string): Impact {
  const [impact, setImpact] = useState<Impact>({ state: 'loading' })
  useEffect(() => {
    let active = true
    fetchPublishImpact(collection, slug, locale)
      .then((result) => active && setImpact({ state: 'ready', impact: result }))
      .catch(() => active && setImpact({ state: 'error' }))
    return () => {
      active = false
    }
  }, [collection, slug, locale])
  return impact
}

/** What publishing refreshes, exactly as the API reports it */
export function PublishImpactList({ impact }: { impact: PublishImpact }): ReactElement {
  return (
    <ul className="editor-impact">
      {impact.paths.map((path) => (
        <li key={path}>
          the page <code>{path}</code>
        </li>
      ))}
      {impact.lists.map((list) => (
        <li key={list}>the lists of {collectionLabel(list).toLowerCase()}</li>
      ))}
      {impact.everyPageReading && <li>every page that reads it, as visitors open them</li>}
      {impact.cachedEntries !== null && (
        <li>
          {impact.cachedEntries === 1 ? '1 cached entry' : `${impact.cachedEntries} cached entries`}{' '}
          carrying it
        </li>
      )}
    </ul>
  )
}

function ImpactSection({ impact }: { impact: Impact }): ReactElement {
  if (impact.state === 'loading') return <p role="status">Reading what publishing refreshes…</p>
  if (impact.state === 'error') {
    return <p>What publishing refreshes could not be read. Publishing still works.</p>
  }
  return (
    <>
      <p>Publishing refreshes:</p>
      <PublishImpactList impact={impact.impact} />
    </>
  )
}

export interface PublishModalProps {
  collection: string
  slug: string
  locale: string
  saved: SavedVersions
  /** The collection renders pages, so there are SEO findings to show */
  hasPage: boolean
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

/** "Publish <slug> v<n>?" — what visitors see now, what publishing refreshes, and the page's SEO findings */
export function PublishModal(props: PublishModalProps): ReactElement {
  const { collection, slug, locale, saved, hasPage, busy, onConfirm, onClose } = props
  const impact = usePublishImpact(collection, slug, locale)
  const seo = isEnabled(useCapabilities(), 'seo') && hasPage
  const findings = usePublishFindings({ seo, collection, slug, locale, version: saved.version })
  const confirmRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      title={publishTitle(slug, saved.version)}
      onClose={busy ? () => undefined : onClose}
      initialFocus={confirmRef}
      busy={busy}
      actions={
        <>
          <Button onClick={busy ? undefined : onClose} aria-disabled={busy}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant="primary"
            onClick={busy ? undefined : onConfirm}
            aria-disabled={busy}
          >
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
        </>
      }
    >
      <p>{publishLead(saved)}</p>
      <ImpactSection impact={impact} />
      <PublishFindingsSection findings={findings} version={saved.version} />
    </Modal>
  )
}
