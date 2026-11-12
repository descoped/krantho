import {
  type ContentStatus,
  ContentWriteConflict,
  type ContentWriter,
  canGetContent,
  canWriteContent,
  type Publication,
} from '@krantho/persistence'
import { compileContentContract, validateDocument } from '@krantho/schema'
import { announceChange } from './content-change.js'
import { lockedByOther } from './content-locks.js'
import { runAfterHook } from './hooks.js'
import { requireRole } from './permissions.js'
import { findReferencingItems } from './reference-resolver.js'
import type { ApiContext, ApiResponse } from './types.js'
import { formatZodErrors } from './validators.js'

/** One document, addressed by collection, slug and locale */
export interface DocumentTarget {
  collection: string
  slug: string
  locale: string | undefined
}

function failure(status: number, error: string): ApiResponse {
  return { status, body: { error } }
}

/** Remove the document, releasing its advisory lock; a response on failure */
async function removeDocument(
  ctx: ApiContext,
  adapter: ContentWriter,
  target: DocumentTarget,
  changedBy: string | undefined,
): Promise<ApiResponse | null> {
  const { collection, slug } = target
  const locale = target.locale ?? ctx.config.site.defaultLocale
  try {
    await adapter.deleteContent(collection, slug, locale, changedBy)
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Unknown error'
    return failure(500, `Failed to delete content: ${reason}`)
  }

  // Release any advisory locks for the deleted content
  if (ctx.lockAdapter) {
    await ctx.lockAdapter.releaseLock(collection, slug, locale)
  }
  return null
}

/**
 * Delete one document (admin). Blocked with 409 while other content references
 * it; the `beforeDelete` hook may abort it by throwing. Without a locale the
 * site's default locale is deleted (the REST delete's behaviour).
 */
export async function deleteDocument(
  ctx: ApiContext,
  target: DocumentTarget,
  changedBy: string | undefined,
): Promise<ApiResponse> {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!canWriteContent(ctx.adapter)) {
    return failure(501, 'Adapter does not support deleteContent')
  }

  const locked = await lockedByOther(ctx, target)
  if (locked) return locked

  const { collection, slug, locale } = target
  // Check reference integrity — block delete if other content references this item
  const referencing = await findReferencingItems(collection, slug, ctx.adapter, ctx.contentConfig)
  if (referencing.length > 0) {
    return {
      status: 409,
      body: { error: 'Cannot delete: referenced by other content', references: referencing },
    }
  }

  // beforeDelete hook — throw to abort
  if (ctx.contentHooks?.beforeDelete) {
    await ctx.contentHooks.beforeDelete({ collection, slug })
  }

  const failed = await removeDocument(ctx, ctx.adapter, target, changedBy)
  if (failed) return failed

  ctx.fireWebhook?.('delete', collection, slug)
  await runAfterHook(ctx.contentHooks?.afterDelete, { collection, slug })
  await announceChange(ctx, { kind: 'document', collection, slug, locale, live: true })

  return { status: 200, body: { slug, collection, message: 'Deleted' } }
}

/** The publication state a publication leaves a document in */
const STATE_AFTER: Readonly<Record<Publication, ContentStatus>> = {
  publish: 'published',
  unpublish: 'draft',
  archive: 'archived',
}

const DONE: Readonly<Record<Publication, string>> = {
  publish: 'Published',
  unpublish: 'Unpublished',
  archive: 'Archived',
}

/** Webhook and after-hook of a committed publication */
async function afterPublication(
  ctx: ApiContext,
  target: DocumentTarget,
  publication: Publication,
): Promise<void> {
  const { collection, slug } = target
  if (publication === 'publish') {
    ctx.fireWebhook?.('publish', collection, slug)
    await runAfterHook(ctx.contentHooks?.afterPublish, { collection, slug })
    return
  }
  ctx.fireWebhook?.('update', collection, slug)
}

/**
 * Publish, unpublish or archive one document (editor), addressed exactly —
 * never another collection's or locale's document that shares the slug.
 * Publishing makes the current version live; unpublishing and archiving take
 * the document offline. Each appends a version, so the history shows who
 * changed what visitors see, and when.
 */
export async function changePublication(
  ctx: ApiContext,
  target: DocumentTarget & { locale: string },
  publication: Publication,
  changedBy: string | undefined,
): Promise<ApiResponse> {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const { collection, slug, locale } = target
  const collectionDef = ctx.contentConfig.collections.get(collection)
  if (!collectionDef) return failure(404, `Collection "${collection}" not found`)
  if (!canWriteContent(ctx.adapter) || !canGetContent(ctx.adapter)) {
    return failure(501, 'Adapter does not support publishing a document by locale')
  }

  const locked = await lockedByOther(ctx, target)
  if (locked) return locked

  const current = await ctx.adapter.getContent(collection, slug, locale)
  if (!current || current.meta.locale !== locale)
    return failure(404, `Content "${collection}/${slug}" (${locale}) not found`)

  const status = STATE_AFTER[publication]
  const contract = current.contract ?? compileContentContract(collectionDef.archetype)
  const validation = validateDocument(contract, {
    fields: current.fields,
    metadata: current.metadata,
    body: current.body,
  })
  if (!validation.success)
    return {
      status: 422,
      body: {
        error: 'Validation failed',
        details: formatZodErrors(validation.error.issues),
      },
    }
  try {
    await ctx.adapter.writeContent(
      {
        ...current,
        collection,
        slug,
        locale,
        publication,
        contract,
        expectedVersion: current.meta.version,
      },
      changedBy,
    )
  } catch (error) {
    if (error instanceof ContentWriteConflict)
      return failure(409, 'Document changed before publication; reload and try again')
    throw error
  }
  await afterPublication(ctx, target, publication)
  await announceChange(ctx, { kind: 'document', collection, slug, locale, live: true })

  const after = await ctx.adapter.getContent(collection, slug, locale)
  return {
    status: 200,
    body: {
      slug,
      collection,
      locale,
      status: after?.meta.status ?? status,
      version: after?.meta.version ?? null,
      liveVersion: after?.meta.liveVersion ?? null,
      message: DONE[publication],
    },
  }
}
