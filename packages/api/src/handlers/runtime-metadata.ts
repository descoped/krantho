import { hasRuntimeSchema, type RuntimeMetadataGroup } from '@krantho/persistence'
import { resolveCollectionContract } from '@krantho/schema'
import { z } from 'zod'
import { changedByFromAuth, requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { formatZodErrors, validateCollectionParam } from '../validators.js'

const definition = z
  .object({
    slot: z.string(),
    id: z.string(),
    label: z.string(),
    required: z.boolean(),
    schema: z.record(z.string(), z.unknown()),
  })
  .strict()

/** Definition edits create new contracts; they never rewrite existing document revisions. */
export const saveRuntimeMetadata: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied
  const checked = validateCollectionParam(req.params['collection'], ctx)
  if (!checked.isValid) return checked.response
  if (!hasRuntimeSchema(ctx.adapter))
    return { status: 501, body: { error: 'Adapter does not support runtime definitions' } }
  const parsed = definition.safeParse(req.body)
  if (!parsed.success)
    return {
      status: 422,
      body: { error: 'Invalid metadata definition', details: formatZodErrors(parsed.error.issues) },
    }
  const group: RuntimeMetadataGroup = parsed.data
  if (Object.hasOwn(checked.collectionDef.archetype.metadata, group.slot))
    return { status: 409, body: { error: 'This metadata group is defined in code' } }
  const previous = await ctx.adapter.getRuntimeSchema(checked.collection)
  const existing = previous?.metadata?.find((entry) => entry.slot === group.slot)
  if (existing && existing.id !== group.id)
    return { status: 409, body: { error: 'A metadata group keeps its identity' } }
  const next = {
    collection: checked.collection,
    fields: previous?.fields ?? [],
    metadata: [...(previous?.metadata ?? []).filter((entry) => entry.slot !== group.slot), group],
    updatedAt: new Date().toISOString(),
  }
  try {
    resolveCollectionContract(checked.collectionDef, next)
  } catch (error) {
    return {
      status: 422,
      body: { error: error instanceof Error ? error.message : 'Unsupported definition' },
    }
  }
  await ctx.adapter.saveRuntimeSchema(checked.collection, next, changedByFromAuth(ctx.auth))
  return { status: 200, body: { contract: resolveCollectionContract(checked.collectionDef, next) } }
}

/** Removing a runtime group changes only the active definition, never saved snapshots. */
export const deleteRuntimeMetadata: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied
  const checked = validateCollectionParam(req.params['collection'], ctx)
  if (!checked.isValid) return checked.response
  if (!hasRuntimeSchema(ctx.adapter))
    return { status: 501, body: { error: 'Adapter does not support runtime definitions' } }
  const slot = req.params['slot']
  if (!slot) return { status: 400, body: { error: 'Missing metadata slot' } }
  if (Object.hasOwn(checked.collectionDef.archetype.metadata, slot))
    return { status: 409, body: { error: 'This metadata group is defined in code' } }
  const current = await ctx.adapter.getRuntimeSchema(checked.collection)
  if (!current?.metadata?.some((group) => group.slot === slot))
    return { status: 404, body: { error: 'Metadata group not found' } }
  const next = {
    ...current,
    metadata: current.metadata.filter((group) => group.slot !== slot),
    updatedAt: new Date().toISOString(),
  }
  await ctx.adapter.saveRuntimeSchema(checked.collection, next, changedByFromAuth(ctx.auth))
  return { status: 200, body: { contract: resolveCollectionContract(checked.collectionDef, next) } }
}
