import { CircleAlert, CircleCheck, Clock, RotateCw, Send, Webhook } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import { fetchWebhookDeliveries, retryWebhookDelivery, type WebhookDelivery } from '../lib/api.js'
import { ApiError } from '../lib/api-client.js'
import { errorMessage } from '../lib/fetch.js'
import { formatShortDateTime } from '../lib/format.js'
import { useLoaded } from '../site/use-loaded.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { EmptyState } from '../ui/empty-state.js'
import { useToast } from '../ui/toast.js'
import {
  type DeliveryFilter,
  type DeliveryState,
  deliveryState,
  emptyText,
  FILTERS,
  httpLabel,
  MAX_ATTEMPTS,
  PAGE_SIZE,
  pageText,
} from './deliveries-model.js'
import { LoadError, Loading, SetupNote, SetupSection, ValuesFrom } from './setup-section.js'

const STATES: Readonly<Record<DeliveryState, ReactElement>> = {
  delivered: (
    <Chip tone="success" icon={CircleCheck}>
      Delivered
    </Chip>
  ),
  pending: (
    <Chip tone="warning" icon={Clock}>
      Pending
    </Chip>
  ),
  failed: (
    <Chip tone="danger" icon={CircleAlert}>
      Failed
    </Chip>
  ),
}

function columns(
  retrying: number | null,
  onRetry: (d: WebhookDelivery) => void,
): DataColumn<WebhookDelivery>[] {
  return [
    { id: 'event', header: 'Event', primary: true, cell: (d) => <code>{d.event}</code> },
    { id: 'url', header: 'URL', cell: (d) => <span className="setup-url">{d.url}</span> },
    { id: 'state', header: 'State', cell: (d) => STATES[deliveryState(d)] },
    { id: 'http', header: 'HTTP', numeric: true, cell: (d) => httpLabel(d.status) },
    {
      id: 'attempts',
      header: 'Attempts',
      numeric: true,
      cell: (d) => `${d.attempts} / ${MAX_ATTEMPTS}`,
    },
    { id: 'created', header: 'Created', cell: (d) => formatShortDateTime(d.createdAt) },
    {
      id: 'delivered',
      header: 'Delivered',
      cell: (d) => (d.deliveredAt ? formatShortDateTime(d.deliveredAt) : '—'),
    },
    {
      id: 'retry',
      header: 'Retry',
      cell: (d) =>
        deliveryState(d) === 'failed' ? (
          <Button
            size="sm"
            icon={Send}
            aria-disabled={retrying !== null}
            aria-label={`Retry delivery ${d.id} of ${d.event}`}
            onClick={retrying === null ? () => onRetry(d) : undefined}
          >
            {retrying === d.id ? 'Retrying…' : 'Retry'}
          </Button>
        ) : null,
    },
  ]
}

/** The filter, as a group of toggle buttons */
function Filters({
  filter,
  onFilter,
}: {
  filter: DeliveryFilter
  onFilter: (f: DeliveryFilter) => void
}): ReactElement {
  return (
    <fieldset className="setup-segmented">
      <legend className="visually-hidden">Show deliveries</legend>
      {FILTERS.map((f) => (
        <Button
          key={f.id}
          size="sm"
          variant={filter === f.id ? 'primary' : 'secondary'}
          aria-pressed={filter === f.id}
          onClick={() => onFilter(f.id)}
        >
          {f.label}
        </Button>
      ))}
    </fieldset>
  )
}

/** Retry: the API re-queues the delivery and sends it again; the list is read again after */
function useRetry(reload: () => void): {
  retrying: number | null
  retry: (d: WebhookDelivery) => void
} {
  const toast = useToast()
  const [retrying, setRetrying] = useState<number | null>(null)
  // A ref, not the state: a double click in one tick would send the delivery twice
  const inFlight = useRef<number | null>(null)
  const retry = useCallback(
    (delivery: WebhookDelivery) => {
      if (inFlight.current !== null) return
      inFlight.current = delivery.id
      setRetrying(delivery.id)
      retryWebhookDelivery(delivery.id)
        .then(() =>
          toast({
            text: `Sent delivery ${delivery.id} again. It shows as pending until the webhook answers.`,
          }),
        )
        .catch((err: unknown) =>
          toast({ text: errorMessage(err, 'The delivery could not be retried'), tone: 'error' }),
        )
        .finally(() => {
          inFlight.current = null
          setRetrying(null)
          reload()
        })
    },
    [reload, toast],
  )
  return { retrying, retry }
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number
  total: number
  onPage: (page: number) => void
}): ReactElement | null {
  const text = pageText(page, total)
  if (!text) return null
  const last = Math.ceil(total / PAGE_SIZE) - 1
  return (
    <nav aria-label="Pages of deliveries" className="setup-row">
      <Button
        size="sm"
        aria-disabled={page === 0}
        onClick={page === 0 ? undefined : () => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="setup-muted">{text}</span>
      <Button
        size="sm"
        aria-disabled={page >= last}
        onClick={page >= last ? undefined : () => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}

/** A page of deliveries; null when the API refuses this viewer — it lists them for admins */
async function readDeliveries(
  filter: DeliveryFilter,
  page: number,
): Promise<{ deliveries: WebhookDelivery[]; total: number } | null> {
  const status = filter === 'all' ? undefined : filter
  try {
    return await fetchWebhookDeliveries({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, status })
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 403) return null
    throw err
  }
}

function Deliveries({
  filter,
  page,
  revision,
  onPage,
}: {
  filter: DeliveryFilter
  page: number
  /** Refresh moves it on: the list is read again, and a retry under way keeps its state */
  revision: number
  onPage: (page: number) => void
}): ReactElement {
  const load = useCallback(() => readDeliveries(filter, page), [filter, page])
  const { loaded, reload } = useLoaded(load, 'The deliveries could not be read')
  const seen = useRef(revision)
  useEffect(() => {
    if (seen.current === revision) return
    seen.current = revision
    reload()
  }, [revision, reload])
  const { retrying, retry } = useRetry(reload)
  if (loaded.state === 'loading') return <Loading what="the deliveries" />
  if (loaded.state === 'error') return <LoadError message={loaded.message} onRetry={reload} />
  if (loaded.data === null) return <SetupNote>Only admins see webhook deliveries.</SetupNote>
  const { deliveries, total } = loaded.data
  if (deliveries.length === 0) return <EmptyDeliveries filter={filter} />
  return (
    <>
      <p className="setup-muted">{total === 1 ? '1 delivery' : `${total} deliveries`}</p>
      <DataTable
        caption="Webhook deliveries"
        columns={columns(retrying, retry)}
        rows={deliveries}
        rowKey={(d) => String(d.id)}
      />
      <Pager page={page} total={total} onPage={onPage} />
    </>
  )
}

function EmptyDeliveries({ filter }: { filter: DeliveryFilter }): ReactElement {
  return (
    <EmptyState icon={Webhook} title="No webhook deliveries">
      {emptyText(filter)}{' '}
      {filter === 'all' && (
        <>
          Each webhook the API is created with (<code>createApiHandlers({'{ webhooks }'})</code>)
          logs a delivery here when content is created, updated, published or deleted.
        </>
      )}
    </EmptyState>
  )
}

/** Setup › Integrations: the webhook deliveries, filtered by state, with Retry on failed ones */
export function IntegrationsTab(): ReactElement {
  const [filter, setFilter] = useState<DeliveryFilter>('all')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const onFilter = (next: DeliveryFilter): void => {
    setFilter(next)
    setPage(0)
  }
  const actions = (
    <Button size="sm" icon={RotateCw} onClick={() => setRevision((n) => n + 1)}>
      Refresh
    </Button>
  )
  return (
    <SetupSection
      title="Webhook deliveries"
      actions={actions}
      sources={
        <ValuesFrom source="database">
          The delivery log in the site's database: every webhook sent, its answer and its attempts.
          Delivery logging runs on SQLite only.
        </ValuesFrom>
      }
    >
      <Filters filter={filter} onFilter={onFilter} />
      <Deliveries filter={filter} page={page} revision={revision} onPage={setPage} />
    </SetupSection>
  )
}
