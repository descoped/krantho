import type { LLMAdapter } from '@krantho/ai'
import { type ContentDocument, canGetContent, type ISeoConfigAdapter } from '@krantho/persistence'
import { enrichArchetypeProperties, type GetTypePropertiesFn } from './seo-enrich-archetype.js'
import { enrichMetaDescription } from './seo-enrich-meta.js'

/** In-memory job state (one job at a time) */
export interface EnrichJob {
  id: string
  status: 'running' | 'complete' | 'error'
  type: string
  /** Whether the run writes over values someone set */
  force: boolean
  items: Array<{
    collection: string
    slug: string
    locale?: string | undefined
    status: 'pending' | 'generating' | 'complete' | 'skipped' | 'error'
    result?: string | undefined
    error?: string | undefined
  }>
  startedAt: number
  /** The run that works on the job; a run that finds another's token in the saved job stops */
  runner?: string | undefined
  /** When the job last saved its progress: a running job that has not for a while has lost its runner */
  updatedAt: number
  completedAt?: number | undefined
  summary?: { generated: number; skipped: number; errors: number } | undefined
  /** What the provider reported for the job's completions; zero when it reports none */
  usage: EnrichUsage
}

/** Tokens the job's completions used, and the model that served the first of them */
export interface EnrichUsage {
  inputTokens: number
  outputTokens: number
  model: string | null
}

/** The site setting every instance reads the running job from */
const JOB_SETTING = 'seo.enrich.job'

/** How long a running job may go without saving before its runner counts as lost (a frozen or stopped function) */
const STALE_MS = 90_000

/** How often a running job saves its progress */
const SAVE_EVERY_MS = 2_000

class JobStore {
  private job: EnrichJob | null = null

  get(): EnrichJob | null {
    return this.job
  }

  set(job: EnrichJob): void {
    this.job = job
  }

  clear(): void {
    this.job = null
  }
}

export const jobStore = new JobStore()

/** Save the job where every instance can read it; failing to save never stops the job */
async function persistJob(ctx: ApiContext, job: EnrichJob): Promise<void> {
  job.updatedAt = Date.now()
  try {
    await ctx.siteSettingsAdapter?.setSetting(JOB_SETTING, JSON.stringify(job))
  } catch {
    // The job goes on from this instance's memory
  }
}

const JOB_STATUSES: readonly unknown[] = ['running', 'complete', 'error']

/** Whether a saved value is a job: the fields the takeover and the status endpoint read */
function isJob(value: unknown): value is EnrichJob {
  if (typeof value !== 'object' || value === null) return false
  const job = value as Record<string, unknown>
  return (
    typeof job['id'] === 'string' &&
    typeof job['type'] === 'string' &&
    JOB_STATUSES.includes(job['status']) &&
    typeof job['startedAt'] === 'number' &&
    typeof job['updatedAt'] === 'number' &&
    Array.isArray(job['items']) &&
    typeof job['usage'] === 'object' &&
    job['usage'] !== null
  )
}

/** The job another instance saved, when there is one */
async function storedJob(ctx: ApiContext): Promise<EnrichJob | null> {
  try {
    const raw = await ctx.siteSettingsAdapter?.getSetting(JOB_SETTING)
    const job: unknown = raw ? JSON.parse(raw) : null
    return isJob(job) ? job : null
  } catch {
    return null
  }
}

/** Whether another run has taken the job over: its token is in the saved job, not this run's */
async function takenOver(ctx: ApiContext, job: EnrichJob, runner: string): Promise<boolean> {
  const stored = await storedJob(ctx)
  return stored?.id === job.id && stored.runner !== undefined && stored.runner !== runner
}

/** Whether a running job has stopped saving: its runner is lost */
export function isStale(job: EnrichJob): boolean {
  return job.status === 'running' && Date.now() - job.updatedAt > STALE_MS
}

/**
 * The latest job from any instance. A job this instance is running is read from memory; for
 * another, the saved copy is read, because consecutive requests may reach different instances.
 */
export async function currentJob(ctx: ApiContext): Promise<EnrichJob | null> {
  const own = jobStore.get()
  if (own?.status === 'running' && !isStale(own)) return own
  const stored = await storedJob(ctx)
  if (!stored) return own
  if (!own) return stored
  if (own.id === stored.id) return own.updatedAt >= stored.updatedAt ? own : stored
  return own.startedAt >= stored.startedAt ? own : stored
}

/** Save the job's first state, so any instance can answer for it from the start */
export async function announceJob(ctx: ApiContext, job: EnrichJob): Promise<void> {
  jobStore.set(job)
  await persistJob(ctx, job)
}

import { lockHolder } from '../content-locks.js'
import { loadSeoModule } from '../seo-loader.js'
import type { ApiContext } from '../types.js'

/**
 * Load `getTypeProperties` from the optional `@krantho/seo` package once per
 * job. If the package isn't installed, return null — archetype enrichment will
 * short-circuit to error for each item, but meta-description enrichment still
 * runs independently.
 */
export async function loadGetTypeProperties(): Promise<GetTypePropertiesFn | null> {
  try {
    const seo = await loadSeoModule()
    return seo.getTypeProperties
  } catch {
    return null
  }
}

/** The adapter, adding each completion's usage and model to the job's totals */
function metered(llm: LLMAdapter, job: EnrichJob): LLMAdapter {
  return {
    get supportsJsonSchema() {
      return llm.supportsJsonSchema
    },
    async complete(prompt, options) {
      const result = await llm.complete(prompt, options)
      job.usage.inputTokens += result.usage.inputTokens
      job.usage.outputTokens += result.usage.outputTokens
      job.usage.model ??= result.model || null
      return result
    },
  }
}

/** Context passed to the per-item runner after the per-job setup finishes. */
interface EnrichDeps {
  llm: LLMAdapter
  ctx: ApiContext
  seoConfigAdapter: ISeoConfigAdapter | null
  type: string
  force: boolean
  getTypeProperties: GetTypePropertiesFn | null
}

/** Enrich a single item based on the job type; returns the result classification. */
async function enrichItem(
  item: EnrichJob['items'][number],
  content: ContentDocument,
  deps: EnrichDeps,
): Promise<'generated' | 'skipped' | 'error'> {
  if (deps.type === 'meta-descriptions') {
    return enrichMetaDescription(
      item,
      content,
      deps.llm,
      deps.ctx,
      deps.seoConfigAdapter,
      deps.ctx.config.site,
      deps.ctx.config.seo.enrichment.meta,
      deps.force,
    )
  }

  if (deps.type === 'archetype') {
    if (!deps.getTypeProperties) {
      item.status = 'error'
      item.error = '@krantho/seo not available'
      return 'error'
    }
    return enrichArchetypeProperties(
      item,
      content,
      deps.llm,
      deps.seoConfigAdapter,
      deps.ctx.config.site,
      deps.ctx.config.seo.enrichment.archetype,
      deps.force,
      deps.getTypeProperties,
      deps.ctx,
    )
  }

  item.status = 'skipped'
  item.result = `Unsupported type: ${deps.type}`
  return 'skipped'
}

/** Background enrichment runner */
export async function runEnrichment(
  job: EnrichJob,
  llm: LLMAdapter,
  ctx: ApiContext,
  type: string,
  force: boolean,
): Promise<void> {
  const getTypeProperties = type === 'archetype' ? await loadGetTypeProperties() : null
  const deps: EnrichDeps = {
    llm: metered(llm, job),
    ctx,
    seoConfigAdapter: ctx.seoConfigAdapter ?? null,
    type,
    force,
    getTypeProperties,
  }

  // Taking the job over: the run before this one, if it is still alive, stops at its next item
  const runner = crypto.randomUUID()
  job.runner = runner
  await persistJob(ctx, job)
  let saved = Date.now()

  // A resumed job leaves the items it finished alone
  for (const item of job.items) {
    if (item.status !== 'pending' && item.status !== 'generating') continue
    if (await takenOver(ctx, job, runner)) return
    if (Date.now() - saved >= SAVE_EVERY_MS) {
      saved = Date.now()
      await persistJob(ctx, job)
    }
    try {
      if (!canGetContent(ctx.adapter)) break
      const content = await ctx.adapter.getContent(item.collection, item.slug, item.locale)
      if (!content) {
        item.status = 'skipped'
        item.result = 'Content not found'
        continue
      }
      if ((await lockHolder(ctx, item)) !== null) {
        item.status = 'skipped'
        item.result = 'Being edited by another user'
        continue
      }

      await enrichItem(item, content, deps)
    } catch (err: unknown) {
      item.status = 'error'
      item.error = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  const count = (status: string): number => job.items.filter((i) => i.status === status).length
  job.status = 'complete'
  job.completedAt = Date.now()
  job.summary = { generated: count('complete'), skipped: count('skipped'), errors: count('error') }
  await persistJob(ctx, job)
}
