import { announceChange } from '../content-change.js'
import { lockHolder } from '../content-locks.js'
import { changePublication, deleteDocument } from '../document-actions.js'
import { documentSeo } from '../document-seo.js'
import { isUnsetProperty, saveArchetypeProposal } from '../handlers/seo-enrich-archetype.js'
import { LLMS_TXT_SETTING, loadLlmsTxtSnapshot } from '../handlers/seo-llms-txt.js'
import { saveDocument } from '../save-document.js'
import type { ApiContext, ApiResponse } from '../types.js'
import { isSuccess, responseError } from './call-handler.js'
import { type BaseState, type PendingAction, sha256Hex, stateHash } from './pending-action.js'
import { assistantChangedBy, exactDocument, pathOf } from './tools/support.js'

/** The outcome of one step of a confirmed action */
export interface ActionResult {
  collection?: string | undefined
  slug?: string | undefined
  status: 'done' | 'failed'
  message: string
  version?: number | undefined
}

type DocumentAction = Extract<PendingAction, { kind: 'save_documents' | 'publish' | 'delete' }>

function conflict(
  conflicts: Array<{ collection: string; slug: string; currentVersion: number }>,
): ApiResponse {
  return { status: 409, body: { error: 'Changed since the proposal', conflicts } }
}

/** Whether a document is still in the state the proposal was computed against */
async function unchanged(ctx: ApiContext, base: BaseState, isNew: boolean): Promise<number | null> {
  const current = await exactDocument(ctx, base.collection, base.slug, base.locale)
  if (isNew) return current ? current.meta.version : null
  if (
    current &&
    current.meta.version === base.baseVersion &&
    stateHash(current) === base.baseHash
  ) {
    return null
  }
  return current?.meta.version ?? 0
}

/** 409 when any document changed since the proposal, 423 when someone else holds a lock on one */
async function preflightDocuments(
  ctx: ApiContext,
  action: DocumentAction,
): Promise<ApiResponse | null> {
  const conflicts: Array<{ collection: string; slug: string; currentVersion: number }> = []
  for (const doc of action.documents) {
    const isNew = action.kind === 'save_documents' && doc.baseVersion === 0
    const currentVersion = await unchanged(ctx, doc, isNew)
    if (currentVersion !== null)
      conflicts.push({ collection: doc.collection, slug: doc.slug, currentVersion })
  }
  if (conflicts.length > 0) return conflict(conflicts)

  for (const doc of action.documents) {
    const lock = await lockHolder(ctx, doc)
    if (lock) {
      // No identity: Studio puts this error into the conversation it sends back to the model
      const error = `${pathOf(doc)} is being edited by another user`
      return { status: 423, body: { error, expiresAt: lock.expiresAt } }
    }
  }
  return null
}

/**
 * Check every target before anything is written: documents unchanged since the
 * proposal (version and hash) and not locked by someone else, SEO properties
 * still unset, the llms.txt snapshot unchanged. The refusal, or null.
 */
export async function preflightAction(
  ctx: ApiContext,
  action: PendingAction,
): Promise<ApiResponse | null> {
  if (action.kind === 'save_seo_properties') {
    if (!ctx.seoConfigAdapter)
      return { status: 501, body: { error: 'SEO configuration is not available' } }
    const current = await documentSeo(ctx, action.configId, action.locale)
    if (!current || current.document.meta.version !== action.baseVersion) {
      return { status: 409, body: { error: 'Document changed since the proposal', conflicts: [] } }
    }
    const lock = await lockHolder(ctx, current.document.meta)
    if (lock) return { status: 423, body: { error: 'Being edited by another user' } }
    const props = current.config?.entities[0]?.properties ?? {}
    const set = Object.keys(action.add).filter((key) => !isUnsetProperty(props[key]))
    if (set.length === 0) return null
    return {
      status: 409,
      body: { error: `Changed since the proposal: ${set.join(', ')} now set`, conflicts: [] },
    }
  }
  if (action.kind === 'save_llms_txt') {
    if (!ctx.siteSettingsAdapter)
      return { status: 501, body: { error: 'Site settings are not available' } }
    const snapshot = await loadLlmsTxtSnapshot(ctx)
    if (sha256Hex(snapshot ?? '') === action.beforeHash) return null
    return {
      status: 409,
      body: { error: 'Changed since the proposal: llms.txt was saved since', conflicts: [] },
    }
  }
  return preflightDocuments(ctx, action)
}

/** The current version after a write, for the result line */
async function versionAfter(ctx: ApiContext, doc: BaseState): Promise<number | undefined> {
  return (await exactDocument(ctx, doc.collection, doc.slug, doc.locale))?.meta.version
}

/** Run one document's step; a failure is reported and the next step still runs */
async function documentStep(
  ctx: ApiContext,
  doc: BaseState,
  step: () => Promise<ApiResponse>,
  done: string,
  withVersion: boolean,
): Promise<ActionResult> {
  const where = { collection: doc.collection, slug: doc.slug }
  try {
    const response = await step()
    if (!isSuccess(response))
      return { ...where, status: 'failed', message: responseError(response) }
    const version = withVersion ? await versionAfter(ctx, doc) : undefined
    const suffix = version !== undefined ? ` (v${version})` : ''
    return { ...where, status: 'done', message: `${done} ${pathOf(doc)}${suffix}`, version }
  } catch (err: unknown) {
    return { ...where, status: 'failed', message: err instanceof Error ? err.message : 'Failed' }
  }
}

type SaveTarget = Extract<PendingAction, { kind: 'save_documents' }>['documents'][number]

/** Save one proposed draft as the user saw it */
async function saveStep(ctx: ApiContext, doc: SaveTarget, changedBy: string): Promise<ApiResponse> {
  const saved = await saveDocument(ctx, {
    collection: doc.collection,
    slug: doc.slug,
    locale: doc.locale,
    fields: doc.fields,
    body: doc.body,
    isNew: doc.baseVersion === 0,
    expectedVersion: doc.baseVersion || undefined,
    changedBy,
  })
  return saved.ok ? { status: 200, body: {} } : saved.response
}

async function executeDocuments(ctx: ApiContext, action: DocumentAction): Promise<ActionResult[]> {
  const changedBy = assistantChangedBy(ctx.auth)
  const results: ActionResult[] = []
  if (action.kind === 'save_documents') {
    for (const doc of action.documents) {
      results.push(
        await documentStep(ctx, doc, () => saveStep(ctx, doc, changedBy), 'Saved draft', true),
      )
    }
    return results
  }

  const publish = action.kind === 'publish'
  for (const doc of action.documents) {
    const target = { collection: doc.collection, slug: doc.slug, locale: doc.locale }
    const step = publish
      ? () => changePublication(ctx, target, 'publish', changedBy)
      : () => deleteDocument(ctx, target, changedBy)
    results.push(await documentStep(ctx, doc, step, publish ? 'Published' : 'Deleted', publish))
  }
  return results
}

/** Execute a verified, preflighted action; each step's outcome is reported */
export async function executeAction(
  ctx: ApiContext,
  action: PendingAction,
): Promise<ActionResult[]> {
  if (action.kind === 'save_seo_properties') {
    if (!ctx.seoConfigAdapter)
      return [{ status: 'failed', message: 'SEO configuration is not available' }]
    try {
      await saveArchetypeProposal(ctx, action)
    } catch (error) {
      return [
        {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Document metadata could not be saved',
        },
      ]
    }
    const count = Object.keys(action.add).length
    return [
      { status: 'done', message: `Saved ${count} Schema.org properties for ${action.configId}` },
    ]
  }
  if (action.kind === 'save_llms_txt') {
    if (!ctx.siteSettingsAdapter)
      return [{ status: 'failed', message: 'Site settings are not available' }]
    await ctx.siteSettingsAdapter.setSetting(LLMS_TXT_SETTING, action.text)
    await announceChange(ctx, { kind: 'seo' })
    return [{ status: 'done', message: 'Saved llms.txt' }]
  }
  return executeDocuments(ctx, action)
}
