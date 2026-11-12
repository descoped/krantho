import { Check, FilePlus } from 'lucide-react'
import { type ReactElement, useCallback, useState } from 'react'
import { Link } from 'react-router'
import { createLocaleVersion } from '../editor/use-locale-versions.js'
import {
  type CollectionTranslationStatus,
  fetchTranslationStatus,
  type LocaleSettings,
  type TranslationItem,
} from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { errorMessage } from '../lib/fetch.js'
import { collectionLabel } from '../lib/format.js'
import { editorPath } from '../lib/paths.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { useToast } from '../ui/toast.js'
import { LoadError, Loading, SetupSection, ValuesFrom } from './setup-section.js'

/** One cell's version: which document, in which locale */
interface Version {
  collection: string
  slug: string
  locale: string
}

const keyOf = (v: Version): string => `${v.collection}/${v.slug}/${v.locale}`

interface CellProps {
  version: Version
  item: TranslationItem
  defaultLocale: string
  /** Editors create drafts; the API refuses a viewer */
  canCreate: boolean
  created: ReadonlySet<string>
  busy: string | null
  onCreate: (version: Version) => void
}

/** A locale's cell: the version exists, was just created, can be created, or is missing */
function LocaleCell({
  version,
  item,
  defaultLocale,
  canCreate,
  created,
  busy,
  onCreate,
}: CellProps): ReactElement {
  const { collection, slug, locale } = version
  if (item.locales.includes(locale))
    return (
      <Chip tone="success" icon={Check}>
        Exists
      </Chip>
    )
  if (created.has(keyOf(version))) {
    return <Link to={editorPath(collection, slug, locale)}>Open the {locale} draft</Link>
  }
  if (!canCreate || !item.locales.includes(defaultLocale))
    return <Chip tone="warning">Missing</Chip>
  return (
    <Button
      size="sm"
      icon={FilePlus}
      aria-disabled={busy !== null}
      aria-label={`Create the ${locale} draft of ${slug}`}
      onClick={busy === null ? () => onCreate(version) : undefined}
    >
      {busy === keyOf(version) ? 'Creating…' : 'Create draft'}
    </Button>
  )
}

function columns(
  locales: readonly string[],
  cell: Omit<CellProps, 'version' | 'item'>,
  collection: string,
): DataColumn<TranslationItem>[] {
  return [
    { id: 'slug', header: 'Document', primary: true, cell: (item) => <code>{item.slug}</code> },
    ...locales.map((locale) => ({
      id: `locale-${locale}`,
      header: locale === cell.defaultLocale ? `${locale} (default)` : locale,
      cell: (item: TranslationItem) => (
        <LocaleCell {...cell} item={item} version={{ collection, slug: item.slug, locale }} />
      ),
    })),
  ]
}

/** Creating missing versions: one at a time, each remembered so its cell opens the draft */
function useCreate(defaultLocale: string): Pick<CellProps, 'created' | 'busy' | 'onCreate'> {
  const toast = useToast()
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const onCreate = useCallback(
    (version: Version) => {
      setBusy(keyOf(version))
      createLocaleVersion(version.collection, version.slug, version.locale, defaultLocale)
        .then(() => {
          setCreated((current) => new Set([...current, keyOf(version)]))
          toast({
            text: `Created the ${version.locale} draft of ${version.slug}, copied from ${defaultLocale}.`,
          })
        })
        .catch((err: unknown) =>
          toast({ text: errorMessage(err, 'The draft could not be created'), tone: 'error' }),
        )
        .finally(() => setBusy(null))
    },
    [defaultLocale, toast],
  )
  return { created, busy, onCreate }
}

function CollectionCoverage({
  status,
  locales,
  cell,
}: {
  status: CollectionTranslationStatus
  locales: readonly string[]
  cell: Omit<CellProps, 'version' | 'item'>
}): ReactElement {
  const label = collectionLabel(status.collection)
  return (
    <div className="setup-coverage">
      <h3 className="setup-subtitle">{label}</h3>
      {status.items.length === 0 ? (
        <p className="setup-muted">No documents.</p>
      ) : (
        <DataTable
          caption={`${label}: versions per locale`}
          columns={columns(locales, cell, status.collection)}
          rows={status.items}
          rowKey={(item) => item.slug}
        />
      )}
    </div>
  )
}

/**
 * Translation coverage: per collection, which documents have a version in each
 * of the site's locales, with Create draft — copied from the default locale —
 * for a missing one (`GET /api/translations/status`)
 */
export function LocaleCoverage({ settings }: { settings: LocaleSettings }): ReactElement {
  const canCreate = useAuth().hasRole('editor')
  const key = `${settings.defaultLocale}:${settings.supportedLocales.join(',')}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: the locales, as the key, decide the read
  const load = useCallback(() => fetchTranslationStatus(), [key])
  const { loaded, reload } = useLoaded(load, 'Translation coverage could not be read')
  const create = useCreate(settings.defaultLocale)
  const cell = { ...create, defaultLocale: settings.defaultLocale, canCreate }
  return (
    <SetupSection
      title="Translation coverage"
      sources={
        <ValuesFrom source="database">
          Each document's versions as the site's database holds them. Create draft copies the{' '}
          {settings.defaultLocale} version's fields and body into a new draft in that locale; it is
          not live until it is published.
        </ValuesFrom>
      }
    >
      {loaded.state === 'loading' && <Loading what="translation coverage" />}
      {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
      {loaded.state === 'ready' &&
        loaded.data.collections.map((status) => (
          <CollectionCoverage
            key={status.collection}
            status={status}
            locales={loaded.data.supportedLocales}
            cell={cell}
          />
        ))}
    </SetupSection>
  )
}
