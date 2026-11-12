import { ListTree } from 'lucide-react'
import { type ReactElement, type RefObject, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../lib/auth.js'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { collectionLabel } from '../lib/format.js'
import { structureScopesPath } from '../lib/paths.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { type CollectionRow, collectionRows, loadCollectionSources } from './collections-model.js'
import { FieldsCard } from './fields-card.js'
import { LoadError, Loading, SetupNote, SetupSection, ValuesFrom } from './setup-section.js'

/** The parameter naming the collection whose fields are open */
const FIELDS_PARAM = 'collection'

/** A list of names as chips; null reads as not known, never as none */
function Names({ names, none }: { names: string[] | null; none: string }): ReactElement {
  if (names === null) return <span className="setup-muted">Not read</span>
  if (names.length === 0) return <span className="setup-muted">{none}</span>
  return (
    <span className="setup-chips">
      {names.map((name) => (
        <Chip key={name}>{name}</Chip>
      ))}
    </span>
  )
}

function CollectionName({ name }: { name: string }): ReactElement {
  return (
    <span className="setup-name">
      {collectionLabel(name)}
      <code className="setup-muted">{name}</code>
    </span>
  )
}

function FieldsButton({
  name,
  open,
  onFields,
}: {
  name: string
  open: boolean
  onFields: (name: string) => void
}): ReactElement {
  return (
    <Button
      size="sm"
      icon={ListTree}
      variant={open ? 'primary' : 'secondary'}
      aria-label={`Fields of ${collectionLabel(name)}`}
      aria-pressed={open}
      onClick={() => onFields(name)}
    >
      Fields
    </Button>
  )
}

function columns(
  open: string | null,
  onFields: (name: string) => void,
): DataColumn<CollectionRow>[] {
  const renders = (row: CollectionRow): ReactElement =>
    row.rendersAt ? <code>{row.rendersAt}</code> : <span className="setup-muted">No pages</span>
  return [
    {
      id: 'collection',
      header: 'Collection',
      primary: true,
      cell: (row) => <CollectionName name={row.collection.name} />,
    },
    { id: 'renders', header: 'Renders at', cell: renders },
    {
      id: 'types',
      header: 'Schema.org types',
      cell: (row) => <Names names={row.types} none="None set" />,
    },
    {
      id: 'rich',
      header: 'Rich results',
      cell: (row) => <Names names={row.richResults} none="None" />,
    },
    {
      id: 'fields',
      header: 'Fields',
      cell: (row) => (
        <FieldsButton
          name={row.collection.name}
          open={open === row.collection.name}
          onFields={onFields}
        />
      ),
    },
  ]
}

function CollectionSources({ seo }: { seo: boolean }): ReactElement {
  return (
    <>
      <ValuesFrom source="config">
        The collections and where they render come from <code>krantho.collections.ts</code>,
        read-only here.
      </ValuesFrom>
      {seo && (
        <ValuesFrom source="database">
          The Schema.org types are each collection's archetype, set in{' '}
          <Link to={structureScopesPath('collection')}>Structure › Scopes &amp; archetypes</Link>.
          The rich results are what the catalog says those types are eligible for.
        </ValuesFrom>
      )}
    </>
  )
}

/** The open collection's fields, focused when they are opened */
function useOpenFields(): {
  open: string | null
  onFields: (name: string) => void
  ref: RefObject<HTMLDivElement | null>
} {
  const [params, setParams] = useSearchParams()
  const open = params.get(FIELDS_PARAM)
  const ref = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (open && opened.current) ref.current?.focus()
    opened.current = false
  }, [open])
  const onFields = useCallback(
    (name: string) => {
      opened.current = true
      setParams({ [FIELDS_PARAM]: name }, { replace: true })
    },
    [setParams],
  )
  return { open, onFields, ref }
}

/** Setup › Collections & schema: each collection, and the open one's fields */
export function CollectionsTab(): ReactElement {
  const seo = isEnabled(useCapabilities(), 'seo')
  const admin = useAuth().hasRole('admin')
  const load = useCallback(() => loadCollectionSources(seo), [seo])
  const { loaded, reload } = useLoaded(load, 'The collections could not be read')
  const { open, onFields, ref } = useOpenFields()
  const collections = loaded.state === 'ready' ? loaded.data.collections : []
  const known = collections.some((collection) => collection.name === open)
  return (
    <div className="setup-stack">
      <SetupSection title="Collections & schema" sources={<CollectionSources seo={seo} />}>
        {loaded.state === 'loading' && <Loading what="the collections" />}
        {loaded.state === 'error' && <LoadError message={loaded.message} onRetry={reload} />}
        {loaded.state === 'ready' && (
          <DataTable
            caption="Collections"
            columns={columns(open, onFields)}
            rows={collectionRows(loaded.data)}
            rowKey={(row) => row.collection.name}
          />
        )}
      </SetupSection>
      {open && loaded.state === 'ready' && !known && (
        <SetupNote>No collection is named {open}.</SetupNote>
      )}
      {open && known && (
        <div ref={ref} tabIndex={-1} className="setup-focus-target">
          <FieldsCard key={open} collection={open} collections={collections} admin={admin} />
        </div>
      )}
    </div>
  )
}
