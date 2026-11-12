import { type ContentDocument, canGetContent, canWriteContent } from '@krantho/persistence'
import { z } from 'zod'
import { findReferencingItems } from '../../reference-resolver.js'
import type { ApiContext } from '../../types.js'
import { diffDocument } from '../document-change.js'
import { type BaseState, stateHash } from '../pending-action.js'
import type { DocumentChange } from '../protocol.js'
import {
  type AssistantTool,
  defineTool,
  type ToolOutcome,
  type ToolRunContext,
} from './define-tool.js'
import { exactDocument, localeOf, pathOf, proposal, refOf } from './support.js'

const documentsInput = z.object({
  documents: z
    .array(
      z.object({
        collection: z.string().min(1),
        slug: z.string().min(1),
        locale: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(20),
})
type DocumentsInput = z.infer<typeof documentsInput>

/** A document a proposal covers: its base state and what confirming changes */
interface Target {
  base: BaseState
  change: DocumentChange
}

function baseOf(doc: ContentDocument): BaseState {
  const { collection, slug, locale, version } = doc.meta
  return { collection, slug, locale, baseVersion: version, baseHash: stateHash(doc) }
}

function canAct(ctx: ApiContext): boolean {
  return canWriteContent(ctx.adapter) && canGetContent(ctx.adapter)
}

/** "Publish pages/about" or "Publish 3 documents" */
function titleFor(verb: string, targets: readonly Target[]): string {
  const first = targets[0]
  if (targets.length === 1 && first) return `${verb} ${pathOf(first.base)}`
  return `${verb} ${targets.length} documents`
}

/** Nothing left to propose: the reasons, for the model and Studio */
function nothingToDo(summary: string, left: string[]): ToolOutcome {
  return {
    result: { ok: true, nothing: true, reasons: left },
    activity: { status: 'done', summary: `${summary}: ${left.join('; ')}`, documents: [] },
  }
}

/** What publishing goes live with: the change from the live version, or the whole draft */
async function publishTarget(ctx: ApiContext, doc: ContentDocument): Promise<Target | string> {
  const live = await ctx.adapter.getPublished?.(doc.meta.collection, doc.meta.slug, doc.meta.locale)
  if (live && live.meta.version === doc.meta.version) return `${pathOf(doc.meta)} is already live`
  const change = live
    ? diffDocument(refOf(doc), doc.meta.version, live, doc)
    : { ref: refOf(doc), baseVersion: doc.meta.version, fields: [] }
  if (doc.meta.status !== 'published')
    change.status = { before: doc.meta.status, after: 'published' }
  return { base: baseOf(doc), change }
}

/** Why a document cannot be deleted, or its delete target */
async function deleteTarget(ctx: ApiContext, doc: ContentDocument): Promise<Target | string> {
  const { collection, slug } = doc.meta
  const referrers = await findReferencingItems(collection, slug, ctx.adapter, ctx.contentConfig)
  if (referrers.length > 0) {
    const by = referrers.map((ref) => `${pathOf(ref)} (${ref.field})`).join(', ')
    return `${pathOf(doc.meta)} is referenced by ${by} and cannot be deleted`
  }
  const change: DocumentChange = {
    ref: refOf(doc),
    baseVersion: doc.meta.version,
    fields: [],
    status: { before: doc.meta.status, after: 'deleted' },
  }
  return { base: baseOf(doc), change }
}

/** The targets of the listed documents; the reasons for those left out */
async function collectTargets(
  run: ToolRunContext,
  input: DocumentsInput,
  target: (ctx: ApiContext, doc: ContentDocument) => Promise<Target | string>,
): Promise<{ targets: Target[]; left: string[] }> {
  const targets: Target[] = []
  const left: string[] = []
  for (const entry of input.documents) {
    const locale = localeOf(run.ctx, entry.locale)
    const doc = await exactDocument(run.ctx, entry.collection, entry.slug, locale)
    const found = doc
      ? await target(run.ctx, doc)
      : `${pathOf(entry)} does not exist in locale ${locale}`
    if (typeof found === 'string') left.push(found)
    else targets.push(found)
  }
  return { targets, left }
}

/** The proposal for the targets, telling the model which documents were left out */
function withLeftOut(outcome: ToolOutcome, left: string[]): ToolOutcome {
  if (left.length === 0) return outcome
  return { ...outcome, result: { ...outcome.result, leftOut: left } }
}

const publishDocumentsTool = defineTool({
  name: 'publish_documents',
  label: 'Publish documents',
  description:
    'Propose publishing the current versions of documents. Nothing goes live until the user confirms in the chat.',
  input: documentsInput,
  role: 'editor',
  available: canAct,
  describe: (input) => `Preparing to publish ${input.documents.map(pathOf).join(', ')}`,
  async run(input, run) {
    const { targets, left } = await collectTargets(run, input, publishTarget)
    if (targets.length === 0) return nothingToDo('Nothing to publish', left)
    const outcome = proposal(
      run,
      { kind: 'publish', documents: targets.map((t) => t.base) },
      { title: titleFor('Publish', targets), confirmLabel: 'Publish', destructive: false },
      {
        summary: `${titleFor('Publish', targets)} — needs your confirmation`,
        documents: targets.map((t) => t.change.ref),
        changes: targets.map((t) => t.change),
      },
    )
    return withLeftOut(outcome, left)
  },
})

const deleteDocumentsTool = defineTool({
  name: 'delete_documents',
  label: 'Delete documents',
  description:
    'Propose deleting documents. Documents other content references are left out. Nothing is deleted until the user confirms in the chat.',
  input: documentsInput,
  role: 'admin',
  available: canAct,
  describe: (input) => `Preparing to delete ${input.documents.map(pathOf).join(', ')}`,
  async run(input, run) {
    const { targets, left } = await collectTargets(run, input, deleteTarget)
    if (targets.length === 0) return nothingToDo('Nothing to delete', left)
    const outcome = proposal(
      run,
      { kind: 'delete', documents: targets.map((t) => t.base) },
      { title: titleFor('Delete', targets), confirmLabel: 'Delete', destructive: true },
      {
        summary: `${titleFor('Delete', targets)} — needs your confirmation`,
        documents: targets.map((t) => t.change.ref),
        changes: targets.map((t) => t.change),
      },
    )
    return withLeftOut(outcome, left)
  },
})

/** Tools that propose publishing and deleting */
export const ACTION_TOOLS: readonly AssistantTool[] = [publishDocumentsTool, deleteDocumentsTool]
