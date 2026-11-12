import { type ReactElement, useState } from 'react'
import { Link } from 'react-router'
import type { DocumentMeta } from '../../lib/api-types.js'
import { type DocumentStatus, documentStatus, STATUS_LABELS } from '../../lib/document-status.js'
import type { SiteLocales } from '../../lib/locales.js'
import { Button } from '../../ui/button.js'
import { StatusDot } from '../../ui/status-dot.js'
import { CreateLocaleModal, type LocaleVersionTarget, localeVersionPath } from '../locale-chips.js'
import { PublishImpactList, usePublishImpact } from '../publish-modal.js'
import { type LocaleVersions, useLocaleVersions } from '../use-locale-versions.js'
import { PanelCard, PanelNote } from './panel-card.js'
import type { PanelDocument } from './panel-document.js'

/** One locale's version: open it, its status, or Create draft when it is missing */
function LocaleRow({
  target,
  locale,
  current,
  status,
  versions,
  canCreate,
  onCreate,
}: {
  target: LocaleVersionTarget
  locale: string
  current: boolean
  status: DocumentStatus | null
  versions: LocaleVersions
  canCreate: boolean
  onCreate: () => void
}): ReactElement {
  const name = locale.toUpperCase()
  const state = current ? 'exists' : versions.states?.get(locale)
  return (
    <li className="side-locale" data-locale={locale}>
      {state === 'exists' ? (
        <Link to={localeVersionPath(target, locale)} aria-current={current ? 'true' : undefined}>
          {name}
        </Link>
      ) : (
        <span className="side-locale-name">{name}</span>
      )}
      <LocaleState state={state} status={status} />
      {state === 'missing' && canCreate && (
        <Button size="sm" aria-label={`Create draft in ${name}`} onClick={onCreate}>
          Create draft
        </Button>
      )}
    </li>
  )
}

function LocaleState({
  state,
  status,
}: {
  state: string | undefined
  status: DocumentStatus | null
}): ReactElement {
  if (state === 'exists' && status) {
    return (
      <span className="side-locale-state">
        <StatusDot status={status} decorative />
        {STATUS_LABELS[status]}
      </span>
    )
  }
  const text =
    state === 'missing' ? 'Missing' : state === 'unknown' ? 'Could not be checked' : 'Checking…'
  return <span className="side-locale-state side-locale-state--quiet">{text}</span>
}

/** The locale rows: each version's status, the open one marked, Create draft for a missing one */
function LocaleRows({
  meta,
  locales,
  versions,
  canCreate,
  onCreate,
}: {
  meta: DocumentMeta
  locales: SiteLocales
  versions: LocaleVersions
  canCreate: boolean
  onCreate: (locale: string) => void
}): ReactElement {
  const target = {
    collection: meta.collection,
    slug: meta.slug,
    defaultLocale: locales.defaultLocale,
  }
  return (
    <ul className="side-locales" aria-label="Locales">
      {locales.supportedLocales.map((locale) => {
        const current = locale === meta.locale
        return (
          <LocaleRow
            key={locale}
            target={target}
            locale={locale}
            current={current}
            status={current ? documentStatus(meta) : (versions.statuses?.get(locale) ?? null)}
            versions={versions}
            canCreate={canCreate}
            onCreate={() => onCreate(locale)}
          />
        )
      })}
    </ul>
  )
}

/** Each of the site's locales, with its version's status and Create draft for a missing one */
function Locales({
  meta,
  locales,
  canCreate,
}: {
  meta: DocumentMeta
  locales: SiteLocales
  canCreate: boolean
}): ReactElement {
  const { supportedLocales, defaultLocale } = locales
  const versions = useLocaleVersions(meta.collection, meta.slug, supportedLocales, defaultLocale)
  const [creating, setCreating] = useState<string | null>(null)
  const rows = { meta, locales, versions, canCreate }
  return (
    <>
      <LocaleRows {...rows} onCreate={setCreating} />
      {creating && (
        <CreateLocaleModal
          locale={creating}
          props={{ collection: meta.collection, slug: meta.slug, defaultLocale }}
          create={versions.create}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  )
}

/** What publishing this version would refresh, from the API */
function Refreshes({ meta }: { meta: DocumentMeta }): ReactElement {
  const impact = usePublishImpact(meta.collection, meta.slug, meta.locale)
  if (impact.state === 'loading') return <PanelNote>Reading what publishing refreshes…</PanelNote>
  if (impact.state === 'error') {
    return <PanelNote>What publishing refreshes could not be read.</PanelNote>
  }
  return (
    <div className="side-refreshes">
      <p className="side-subtitle">Publishing refreshes</p>
      <PublishImpactList impact={impact.impact} />
    </div>
  )
}

/**
 * Reach: the document in each of the site's locales, and — for a collection
 * whose documents render pages — what publishing it refreshes
 */
export function ReachCard({ doc }: { doc: PanelDocument }): ReactElement {
  const { meta, locales } = doc
  if (!meta) {
    return (
      <PanelCard title="Reach">
        <PanelNote>Save the page first: its locale versions follow.</PanelNote>
      </PanelCard>
    )
  }
  return (
    <PanelCard title="Reach">
      {locales ? (
        <Locales meta={meta} locales={locales} canCreate={doc.canEdit} />
      ) : (
        <PanelNote>The site's locales could not be read.</PanelNote>
      )}
      {doc.info?.pages && <Refreshes meta={meta} />}
    </PanelCard>
  )
}
