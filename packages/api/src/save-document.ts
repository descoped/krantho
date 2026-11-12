import type { ContentChange } from '@krantho/core'
import {
  type ContentContract,
  type ContentDocument,
  ContentWriteConflict,
  type ContentWriter,
  canGetContent,
  canWriteContent,
  currentIsLive,
  type DefaultProvenance,
} from '@krantho/persistence'
import { type Collection, retainDefaultProvenance, validateDocument } from '@krantho/schema'
import type { ZodObject, ZodRawShape } from 'zod'
import { announceChange } from './content-change.js'
import { lockedByOther } from './content-locks.js'
import { runAfterHook, runBeforeSave } from './hooks.js'
import { getActiveContract } from './merged-schema.js'
import { requireRole } from './permissions.js'
import type { ApiContext, ApiResponse } from './types.js'
import { formatZodErrors } from './validators.js'

/** One document save, as the REST create/update handlers and the assistant make it */
export interface SaveDocumentInput {
  collection: string
  slug: string
  fields: Record<string, unknown>
  /** A string replaces the body; undefined keeps the current body (existing documents only) */
  body: string | undefined
  locale: string | undefined
  isNew: boolean
  /** Reject with 409 when the current version differs */
  expectedVersion?: number | undefined
  changedBy: string
  repositoryBasis?: ContentDocument['repositoryBasis'] | undefined
  metadata?: unknown
  defaults?: readonly DefaultProvenance[] | undefined
}

/** A committed save: the document's version after it and its live version (null when nothing is live) */
export type SaveDocumentResult =
  | { ok: true; slug: string; version: number; liveVersion: number | null }
  | { ok: false; response: ApiResponse }

type PreparedFields =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; response: ApiResponse }

/**
 * Validate a document's values against the collection's active contract, as
 * `saveDocument` does: a draft prepared ahead of its save (the assistant's)
 * passes or fails exactly as the save will.
 */
export async function prepareFields(
  ctx: ApiContext,
  collectionDef: Collection<ZodObject<ZodRawShape>>,
  values: { fields: Record<string, unknown>; body: string; metadata: ContentDocument['metadata'] },
): Promise<PreparedFields> {
  const contract = await getActiveContract(collectionDef, ctx.adapter)
  const validation = validateDocument(contract, values)
  if (!validation.success)
    return {
      ok: false,
      response: {
        status: 422,
        body: { error: 'Validation failed', details: formatZodErrors(validation.error.issues) },
      },
    }
  return { ok: true, fields: validation.data.fields }
}

/** Optimistic concurrency: 409 when the current version is not the expected one */
function versionConflict(
  input: SaveDocumentInput,
  current: ContentDocument | null,
): ApiResponse | null {
  if (input.expectedVersion === undefined) return null
  if ((current?.meta.version ?? 0) === input.expectedVersion) return null
  return {
    status: 409,
    body: {
      error: 'Content has been modified by another user',
      currentVersion: current?.meta.version ?? 0,
      yourVersion: input.expectedVersion,
    },
  }
}

/**
 * The change a committed save announces: visitors see it only when the saved
 * version is live — never on an adapter with history, where a save keeps the
 * live version; at once on one without (the filesystem adapter).
 */
export async function savedChange(
  ctx: ApiContext,
  target: { collection: string; slug: string; locale: string | undefined },
): Promise<ContentChange & { version: number; liveVersion: number | null }> {
  const saved = canGetContent(ctx.adapter)
    ? await ctx.adapter.getContent(target.collection, target.slug, target.locale)
    : null
  const version = saved?.meta.version ?? 0
  const liveVersion = saved?.meta.liveVersion ?? null
  return {
    kind: 'document',
    collection: target.collection,
    slug: target.slug,
    locale: target.locale,
    live: currentIsLive({ version, liveVersion }),
    version,
    liveVersion,
  }
}

/** Write the prepared save as a new version: a save keeps the live version */
async function writeDocument(
  adapter: ContentWriter,
  input: SaveDocumentInput,
  slug: string,
  fields: Record<string, unknown>,
  body: string,
  contract: ContentContract,
  metadata: Record<string, Record<string, unknown>>,
  current: ContentDocument | null,
): Promise<void> {
  await adapter.writeContent(
    {
      collection: input.collection,
      slug,
      fields,
      body,
      locale: input.locale,
      contract,
      metadata,
      repositoryBasis: input.repositoryBasis ?? current?.repositoryBasis ?? null,
      defaults: retainDefaultProvenance(input.defaults ?? current?.defaults ?? [], metadata),
      expectedVersion: input.isNew ? 0 : (input.expectedVersion ?? current?.meta.version),
    },
    input.changedBy,
  )
}

/** Webhook, after-hook and change announcement of a committed save */
async function afterSave(
  ctx: ApiContext,
  input: SaveDocumentInput,
  slug: string,
): Promise<{ version: number; liveVersion: number | null }> {
  const { collection, locale } = input
  ctx.fireWebhook?.(input.isNew ? 'create' : 'update', collection, slug)
  const hook = input.isNew ? ctx.contentHooks?.afterCreate : ctx.contentHooks?.afterUpdate
  await runAfterHook(hook, { collection, slug })

  const { version, liveVersion, ...change } = await savedChange(ctx, { collection, slug, locale })
  await announceChange(ctx, change)
  return { version, liveVersion }
}

/** The document as it stands before a save, or null for a new one */
async function currentDocument(
  ctx: ApiContext,
  input: SaveDocumentInput,
): Promise<ContentDocument | null> {
  if (input.isNew || !canGetContent(ctx.adapter)) return null
  const current = await ctx.adapter.getContent(input.collection, input.slug, input.locale)
  const locale = input.locale ?? ctx.config.site.defaultLocale
  return current?.meta.locale === locale ? current : null
}

/**
 * 409 when a create names a document that already exists: a create never
 * writes over one, so another user's lock and version are never passed by.
 * Read where the write would land — the same collection, slug and locale.
 * This early check provides a readable error; the adapter atomically rejects
 * a concurrent create through expectedVersion zero.
 */
async function alreadyExists(
  ctx: ApiContext,
  input: SaveDocumentInput,
  slug: string,
): Promise<ApiResponse | null> {
  if (!canGetContent(ctx.adapter)) return null
  const existing = await ctx.adapter.getContent(input.collection, slug, input.locale)
  if (!existing || existing.meta.locale !== (input.locale ?? ctx.config.site.defaultLocale))
    return null
  const error = `"${input.collection}/${slug}" already exists. Open it and save it instead.`
  return { status: 409, body: { error } }
}

type Step<T> = { ok: true; value: T } | { ok: false; response: ApiResponse }

const fail = (status: number, error: string): { ok: false; response: ApiResponse } => ({
  ok: false,
  response: { status, body: { error } },
})

/** Role, collection, adapter, edit lock, version and existence, checked before anything runs */
async function admitSave(
  ctx: ApiContext,
  input: SaveDocumentInput,
): Promise<
  Step<{
    collectionDef: Collection<ZodObject<ZodRawShape>>
    writer: ContentWriter
    current: ContentDocument | null
  }>
> {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return { ok: false, response: denied }
  const collectionDef = ctx.contentConfig.collections.get(input.collection)
  if (!collectionDef) return fail(404, `Collection "${input.collection}" not found`)
  if (!canWriteContent(ctx.adapter)) return fail(501, 'Adapter does not support writeContent')

  // Locks are checked when the request arrives; a lock taken after this point
  // does not stop the write, and `expectedVersion` still catches the conflict
  const locked = input.isNew ? null : await lockedByOther(ctx, input)
  if (locked) return { ok: false, response: locked }

  const current = await currentDocument(ctx, input)
  const conflict = versionConflict(input, current)
  if (conflict) return { ok: false, response: conflict }
  if (!input.isNew && input.body === undefined && !canGetContent(ctx.adapter))
    return fail(501, 'Adapter cannot read a document, so a save must send its body')
  if (!input.isNew && canGetContent(ctx.adapter) && !current)
    return fail(404, `Content "${input.collection}/${input.slug}" not found`)
  return { ok: true, value: { collectionDef, writer: ctx.adapter, current } }
}

/** Metadata as the request sends it: an object of groups, each an object of properties */
function isMetadata(value: unknown): value is ContentDocument['metadata'] {
  const isRecord = (entry: unknown): entry is Record<string, unknown> =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
  return isRecord(value) && Object.values(value).every(isRecord)
}

/** The before-save hook's view of the save: a save without a body merges the fields it names */
function hookInput(
  input: SaveDocumentInput,
  metadata: ContentDocument['metadata'],
  current: ContentDocument | null,
) {
  return {
    collection: input.collection,
    slug: input.slug,
    fields:
      input.body === undefined && current ? { ...current.fields, ...input.fields } : input.fields,
    body: input.body ?? current?.body ?? '',
    metadata,
    isNew: input.isNew,
  }
}

/** The adapter's conflict as the 409 a client reloads on */
function writeConflict(error: ContentWriteConflict): { ok: false; response: ApiResponse } {
  return {
    ok: false,
    response: {
      status: 409,
      body: {
        error: error.message,
        currentVersion: error.currentVersion,
        yourVersion: error.expectedVersion,
      },
    },
  }
}

/**
 * Save one document as a new version: role, collection, edit lock,
 * concurrency, the before-save hook, the active contract, the write, then the
 * webhook, the after-hook and the change announcement. A save never changes
 * what visitors see — publishing does (`changePublication`). The single write
 * path of the REST handlers and the assistant.
 */
export async function saveDocument(
  ctx: ApiContext,
  input: SaveDocumentInput,
): Promise<SaveDocumentResult> {
  const admitted = await admitSave(ctx, input)
  if (!admitted.ok) return admitted
  const { collectionDef, writer, current } = admitted.value

  // The hook sees metadata of the right shape; the contract checks its groups after it
  const sent = input.metadata === undefined ? (current?.metadata ?? {}) : input.metadata
  if (!isMetadata(sent)) return fail(422, 'Metadata must be an object of named groups')
  const hooked = await runBeforeSave(ctx.contentHooks, hookInput(input, sent, current))
  const slug = input.isNew ? hooked.slug : input.slug
  const exists = input.isNew ? await alreadyExists(ctx, input, slug) : null
  if (exists) return { ok: false, response: exists }

  const contract = await getActiveContract(collectionDef, ctx.adapter)
  const parsed = validateDocument(contract, {
    fields: hooked.fields,
    body: hooked.body,
    metadata: hooked.metadata,
  })
  if (!parsed.success) {
    const details = formatZodErrors(parsed.error.issues)
    return { ok: false, response: { status: 422, body: { error: 'Validation failed', details } } }
  }
  const { fields, body, metadata } = parsed.data
  try {
    await writeDocument(writer, input, slug, fields, body, contract, metadata, current)
  } catch (error) {
    if (error instanceof ContentWriteConflict) return writeConflict(error)
    throw error
  }
  return { ok: true, slug, ...(await afterSave(ctx, input, slug)) }
}
