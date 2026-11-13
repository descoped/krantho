import type { LLMAdapter } from '@krantho/ai'
import { canQuery, type QueryReader } from '@krantho/persistence'
import { groupByCollection } from '../group-by-collection.js'
import { requireRole } from '../permissions.js'
import type { ApiContext, ApiHandler, ApiResponse } from '../types.js'
import { validateRequestBody } from '../validators.js'
import { resolveAdapter } from './llm-resolve.js'
import type { EnrichJob } from './seo-enrich-runner.js'
import { announceJob, currentJob, isStale, runEnrichment } from './seo-enrich-runner.js'

/** Which documents a job enriches: the whole site, one collection, or one document of one collection */
type EnrichScope =
  | { scope: 'all' }
  | { scope: 'collection'; collection: string }
  | { scope: 'item'; collection: string; slug: string }

/**
 * The scope a request asks for: `scope` when given, else inferred from what
 * it names (a collection and a slug, a collection, or neither). A collection
 * or item scope must name a configured collection, and an item its slug.
 */
function enrichScope(payload: Record<string, unknown>, ctx: ApiContext): EnrichScope | string {
  const collection = typeof payload.collection === 'string' ? payload.collection : undefined
  const slug = typeof payload.slug === 'string' ? payload.slug : undefined
  const named = slug !== undefined ? 'item' : collection !== undefined ? 'collection' : 'all'
  const scope = payload.scope ?? named
  if (scope === 'all') return { scope }
  if (scope !== 'collection' && scope !== 'item') return 'scope is all, collection or item'
  if (collection === undefined || !ctx.contentConfig.collections.has(collection)) {
    return `scope ${scope} needs a configured collection`
  }
  if (scope === 'collection') return { scope, collection }
  if (slug === undefined) return 'scope item needs a slug'
  return { scope, collection, slug }
}

/** The store when it can query, read and write content; null otherwise */
function enrichStore(adapter: ApiContext['adapter']): QueryReader | null {
  const { getContent, writeContent } = adapter
  return canQuery(adapter) && getContent && writeContent ? adapter : null
}

/** The documents a job enriches: every document of the scope's collections, one document for an item */
async function enrichItems(
  adapter: QueryReader,
  ctx: ApiContext,
  target: EnrichScope,
): Promise<EnrichJob['items']> {
  const names =
    target.scope === 'all' ? [...ctx.contentConfig.collections.keys()] : [target.collection]
  const { items: metas } = await adapter.query({
    state: 'current',
    projection: 'meta',
    collections: names,
  })
  const documents = groupByCollection(metas, names, (meta) => meta.collection)
  const items: EnrichJob['items'] = []
  for (const collection of names) {
    for (const meta of documents.get(collection) ?? []) {
      if (target.scope === 'item' && meta.slug !== target.slug) continue
      items.push({ collection, slug: meta.slug, locale: meta.locale, status: 'pending' })
    }
  }
  return items
}

/** Start a job over the items in the background; the response names it */
async function startJob(
  ctx: ApiContext,
  llm: LLMAdapter,
  type: string,
  force: boolean,
  items: EnrichJob['items'],
): Promise<EnrichJob> {
  const job: EnrichJob = {
    id: `enrich-${Date.now()}`,
    status: 'running',
    type,
    force,
    items,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    usage: { inputTokens: 0, outputTokens: 0, model: null },
  }
  await announceJob(ctx, job)
  const run = runEnrichment(job, llm, ctx, type, force)
  ctx.waitUntil?.(run)
  return job
}

/** The refusal while another job runs, on any instance: one job at a time; a job that lost its runner does not count */
async function runningJob(ctx: ApiContext): Promise<ApiResponse | null> {
  const active = await currentJob(ctx)
  if (active?.status !== 'running' || isStale(active)) return null
  return { status: 409, body: { error: 'An enrichment job is already running', jobId: active.id } }
}

/**
 * POST /api/seo/enrich — enrich the documents of a scope (`all`, `collection`
 * or `item`): a collection scope reads only that collection's documents, an
 * item only that collection's document with the slug.
 */
export const seoEnrich: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const running = await runningJob(ctx)
  if (running) return running

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response
  const payload = bodyCheck.body as Record<string, unknown>
  const target = enrichScope(payload, ctx)
  if (typeof target === 'string') return { status: 400, body: { error: target } }
  const type = (payload.type as string) ?? 'meta-descriptions'

  const llm = await resolveAdapter(ctx).catch((err: unknown) =>
    err instanceof Error ? err.message : 'Failed to create LLM adapter',
  )
  if (typeof llm === 'string') return { status: 400, body: { error: llm } }

  const store = enrichStore(ctx.adapter)
  if (!store) {
    return {
      status: 501,
      body: { error: 'Persistence adapter does not support content read/write' },
    }
  }

  const items = await enrichItems(store, ctx, target)
  if (items.length === 0) {
    return { status: 200, body: { jobId: null, message: 'No items to enrich' } }
  }
  const job = await startJob(ctx, llm, type, payload.force === true, items)
  return {
    status: 202,
    body: { jobId: job.id, status: 'running', type, totalItems: items.length },
  }
}

/**
 * A job whose runner stopped (the function that ran it was frozen or ended) goes on from the
 * pending items on this instance; the items it finished are not run again.
 */
async function resumeIfLost(job: EnrichJob, ctx: ApiContext): Promise<void> {
  if (!isStale(job)) return
  try {
    const llm = await resolveAdapter(ctx)
    await announceJob(ctx, job)
    ctx.waitUntil?.(runEnrichment(job, llm, ctx, job.type, job.force))
  } catch {
    // Without a model, or when the job cannot be saved, it is reported as it stands: the next
    // status request tries again
  }
}

/** GET /api/seo/enrich/status — poll job progress, from whichever instance answers */
export const seoEnrichStatus: ApiHandler = async (req, ctx) => {
  const jobId = req.query.jobId
  const current = await currentJob(ctx)

  if (!current || (jobId && current.id !== jobId)) {
    return { status: 404, body: { error: 'No active enrichment job' } }
  }
  await resumeIfLost(current, ctx)

  const completed = current.items.filter((i) => i.status === 'complete').length
  const skipped = current.items.filter((i) => i.status === 'skipped').length
  const errors = current.items.filter((i) => i.status === 'error').length
  const generating = current.items.find((i) => i.status === 'generating')

  return {
    status: 200,
    body: {
      jobId: current.id,
      status: current.status,
      type: current.type,
      progress: {
        total: current.items.length,
        completed,
        skipped,
        errors,
        current: generating ? `${generating.collection}/${generating.slug}` : null,
      },
      items: current.items,
      summary: current.summary,
      usage: current.usage,
    },
  }
}
