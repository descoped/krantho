import type { ContentDocument } from '@krantho/persistence'
import { lockHolder } from '../../content-locks.js'
import { prepareFields, saveDocument } from '../../save-document.js'
import type { ApiResponse } from '../../types.js'
import { responseError } from '../call-handler.js'
import { diffDocument } from '../document-change.js'
import { lockMessage } from '../document-lock.js'
import { type BaseState, stateHash } from '../pending-action.js'
import type { DocumentChange, DocumentRef } from '../protocol.js'
import type { ToolOutcome, ToolRunContext } from './define-tool.js'
import { assistantChangedBy, exactDocument, failure, pathOf, proposal } from './support.js'

/** One document's proposed after-state */
export interface DraftWrite {
  ref: { collection: string; slug: string; locale: string }
  /** The current version, or null for a new document */
  current: ContentDocument | null
  fields: Record<string, unknown>
  body: string
}

/** A draft ready to write or propose: the validated after-state and what it changes */
export interface PreparedDraft {
  write: DraftWrite
  fields: Record<string, unknown>
  change: DocumentChange
}

/** The failure a response carries, with any validation details spelled out */
function responseFailure(response: ApiResponse, documents: DocumentRef[]): ToolOutcome {
  const details = (response.body as { details?: Array<{ field: string; message: string }> })
    ?.details
  const detail = details?.map((d) => `${d.field}: ${d.message}`).join('; ')
  const error = detail ? `${responseError(response)} — ${detail}` : responseError(response)
  return failure(error, { documents })
}

/** A save's base state: the version and hash of the current document */
export function baseStateOf(write: DraftWrite): BaseState {
  return {
    ...write.ref,
    baseVersion: write.current?.meta.version ?? 0,
    baseHash: stateHash(write.current),
  }
}

/**
 * Validate a draft's after-state against the active contract (the values a save
 * would write; a save keeps the document's publication state) and diff it
 * against the current version.
 * Fails when the collection is unknown, the fields do not validate, or nothing
 * changes.
 */
export async function prepareDraft(
  run: ToolRunContext,
  write: DraftWrite,
): Promise<{ ok: true; draft: PreparedDraft } | { ok: false; outcome: ToolOutcome }> {
  const collectionDef = run.ctx.contentConfig.collections.get(write.ref.collection)
  if (!collectionDef) {
    return { ok: false, outcome: failure(`Collection "${write.ref.collection}" not found`) }
  }
  const prepared = await prepareFields(run.ctx, collectionDef, {
    fields: write.fields,
    body: write.body,
    metadata: write.current?.metadata ?? {},
  })
  if (!prepared.ok) return { ok: false, outcome: responseFailure(prepared.response, []) }

  const baseVersion = write.current?.meta.version ?? 0
  const change = diffDocument(
    { ...write.ref, version: baseVersion || undefined },
    baseVersion,
    write.current,
    {
      fields: prepared.fields,
      body: write.body,
    },
  )
  if (write.current && change.fields.length === 0 && !change.body) {
    return { ok: false, outcome: failure(`Nothing to change in ${pathOf(write.ref)}`) }
  }
  return { ok: true, draft: { write, fields: prepared.fields, change } }
}

/** A lock someone else holds on the document, as a failed outcome */
export async function lockedOutcome(
  run: ToolRunContext,
  ref: DraftWrite['ref'],
): Promise<ToolOutcome | null> {
  const lock = await lockHolder(run.ctx, ref)
  if (!lock) return null
  const message = lockMessage(ref, lock)
  return failure(message, { summary: message, documents: [ref] })
}

/** Write a prepared draft now, as a new version recorded as made through the assistant; what visitors see is unchanged */
async function commitDraft(run: ToolRunContext, draft: PreparedDraft): Promise<ToolOutcome> {
  const { write, change } = draft
  const isNew = write.current === null
  const saved = await saveDocument(run.ctx, {
    ...write.ref,
    fields: draft.fields,
    body: write.body,
    isNew,
    expectedVersion: write.current?.meta.version,
    changedBy: assistantChangedBy(run.ctx.auth),
  })
  if (!saved.ok) return responseFailure(saved.response, [write.ref])

  const after = await exactDocument(run.ctx, write.ref.collection, write.ref.slug, write.ref.locale)
  const ref: DocumentRef = { ...write.ref, version: after?.meta.version }
  run.writes.recordWrite(change)
  const changed = [...change.fields.map((field) => field.name), ...(change.body ? ['body'] : [])]
  const verb = isNew ? 'Created' : 'Updated'
  return {
    result: { ok: true, ref, version: ref.version, changed },
    activity: {
      status: 'done',
      summary: `${verb} draft ${pathOf(ref)} (v${ref.version ?? '?'})`,
      documents: [ref],
      changes: [change],
    },
  }
}

/** Propose saving drafts of several documents: nothing is written until the user confirms */
export function proposeDrafts(
  run: ToolRunContext,
  drafts: readonly PreparedDraft[],
  title: string,
  summary: string,
): ToolOutcome {
  const documents = drafts.map((draft) => ({
    ...baseStateOf(draft.write),
    fields: draft.fields,
    body: draft.write.body,
  }))
  return proposal(
    run,
    { kind: 'save_documents', documents },
    { title, confirmLabel: drafts.length > 1 ? 'Save drafts' : 'Save draft', destructive: false },
    {
      summary,
      documents: drafts.map((draft) => draft.change.ref),
      changes: drafts.map((draft) => draft.change),
    },
  )
}

/**
 * Save one document's draft through the write policy: written at once when it
 * creates the document or only fills empty values (and no other document was
 * written in this request), otherwise proposed with its diff.
 */
export async function writeDraft(run: ToolRunContext, write: DraftWrite): Promise<ToolOutcome> {
  const locked = await lockedOutcome(run, write.ref)
  if (locked) return locked

  const prepared = await prepareDraft(run, write)
  if (!prepared.ok) return prepared.outcome

  const { draft } = prepared
  if (run.writes.decide(draft.change) === 'write') return commitDraft(run, draft)
  const path = pathOf(write.ref)
  const title = write.current ? `Save a draft of ${path}` : `Create draft ${path}`
  return proposeDrafts(run, [draft], title, `Proposed changes to ${path} — needs your confirmation`)
}
