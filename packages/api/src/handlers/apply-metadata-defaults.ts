import type { ContentContract, ContentDocument, DefaultProvenance } from '@krantho/persistence'
import { canGetContent } from '@krantho/persistence'
import { type AppliedDefaults, applyMetadataDefaults, validateDocument } from '@krantho/schema'
import { getActiveContract } from '../merged-schema.js'
import { changedByFromAuth, requireRole } from '../permissions.js'
import { saveDocument } from '../save-document.js'
import type { ApiContext, ApiHandler, ApiRequest, ApiResponse } from '../types.js'
import { formatZodErrors, validateCollectionParam, validateRequestBody } from '../validators.js'

/** The two documents a defaults request names: the one to fill and the shared source */
interface DefaultsTarget {
  readonly collection: string
  readonly current: ContentDocument
  readonly source: ContentDocument
  readonly contract: ContentContract
  readonly input: Record<string, unknown>
}

const reply = (status: number, body: unknown): ApiResponse => ({ status, body })

/** Read and check the request: role, collections, both documents in one locale */
async function defaultsTarget(
  req: ApiRequest,
  ctx: ApiContext,
): Promise<DefaultsTarget | ApiResponse> {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied
  const checked = validateCollectionParam(req.params['collection'], ctx)
  if (!checked.isValid) return checked.response
  const body = validateRequestBody(req.body)
  if (!body.isValid) return body.response
  if (!canGetContent(ctx.adapter)) return reply(501, { error: 'Adapter cannot read documents' })
  const input = body.body
  const locale =
    typeof input['locale'] === 'string' ? input['locale'] : ctx.config.site.defaultLocale
  const sourceCollection =
    typeof input['sourceCollection'] === 'string' ? input['sourceCollection'] : ''
  const sourceSlug = typeof input['sourceSlug'] === 'string' ? input['sourceSlug'] : ''
  if (!ctx.contentConfig.collections.has(sourceCollection))
    return reply(404, { error: 'Default collection not found' })
  const source = await ctx.adapter.getContent(sourceCollection, sourceSlug, locale)
  const current = await ctx.adapter.getContent(checked.collection, req.params['slug'] ?? '', locale)
  if (!source || !current || source.meta.locale !== locale || current.meta.locale !== locale)
    return reply(404, { error: 'Document not found' })
  const contract = await getActiveContract(checked.collectionDef, ctx.adapter)
  return { collection: checked.collection, current, source, contract, input }
}

/** The declared groups to fill: the ones asked for that the source shares by definition */
function slotsToApply(target: DefaultsTarget): string[] | ApiResponse {
  const { contract, source, input } = target
  const asked = input['slots']
  if (
    asked !== undefined &&
    (!Array.isArray(asked) ||
      asked.some((slot) => typeof slot !== 'string' || !Object.hasOwn(contract.metadata, slot)))
  )
    return reply(400, { error: 'Choose declared metadata groups' })
  return Object.keys(contract.metadata).filter(
    (slot) =>
      (asked === undefined || (asked as readonly string[]).includes(slot)) &&
      source.contract?.metadata[slot]?.id === contract.metadata[slot]?.id,
  )
}

/** Commit the previewed defaults as a draft, pinning the source version they came from */
async function commitDefaults(
  ctx: ApiContext,
  target: DefaultsTarget,
  applied: AppliedDefaults,
): Promise<ApiResponse> {
  const { current, source, input } = target
  if (input['sourceVersion'] !== source.meta.version)
    return reply(409, {
      error: 'Shared defaults changed since the preview. Review them again.',
      sourceVersion: source.meta.version,
    })
  if (typeof input['_version'] !== 'number')
    return reply(400, { error: 'A document version is required to apply defaults' })
  const provenance: DefaultProvenance = {
    collection: source.meta.collection,
    slug: source.meta.slug,
    locale: source.meta.locale,
    version: source.meta.version,
    paths: applied.paths,
    values: applied.values,
  }
  const saved = await saveDocument(ctx, {
    collection: target.collection,
    slug: current.meta.slug,
    locale: current.meta.locale,
    isNew: false,
    fields: current.fields,
    body: current.body,
    metadata: applied.metadata,
    expectedVersion: input['_version'],
    changedBy: changedByFromAuth(ctx.auth),
    defaults: [...current.defaults, provenance],
  })
  return saved.ok ? reply(200, saved) : saved.response
}

/** Preview first; committing materializes values and pins provenance in a draft revision. */
export const applyDocumentDefaults: ApiHandler = async (req, ctx) => {
  const target = await defaultsTarget(req, ctx)
  if ('status' in target) return target
  const slots = slotsToApply(target)
  if (!Array.isArray(slots)) return slots
  const { current, source, contract, input } = target
  const applied = applyMetadataDefaults(
    current.metadata,
    source.metadata,
    slots,
    current.defaults.filter(
      (entry) =>
        entry.collection === source.meta.collection &&
        entry.slug === source.meta.slug &&
        entry.locale === source.meta.locale,
    ),
  )
  const validation = validateDocument(contract, {
    fields: current.fields,
    body: current.body,
    metadata: applied.metadata,
  })
  if (!validation.success)
    return reply(422, {
      error: 'Defaults do not satisfy this document',
      details: formatZodErrors(validation.error.issues),
    })
  if (input['apply'] !== true || applied.paths.length === 0)
    return reply(200, {
      metadata: applied.metadata,
      paths: applied.paths,
      version: current.meta.version,
      sourceVersion: source.meta.version,
    })
  return commitDefaults(ctx, target, applied)
}
