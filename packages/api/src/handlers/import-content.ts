import {
  canGetContent,
  contractReferenceMatches,
  type RepositoryDocument,
} from '@krantho/persistence'
import { documentChecksum, parseRepositoryContent } from '@krantho/schema'
import { z } from 'zod'
import { getActiveContract } from '../merged-schema.js'
import { changedByFromAuth, requireRole } from '../permissions.js'
import { saveDocument } from '../save-document.js'
import type { ApiHandler } from '../types.js'
import { formatZodErrors, validateCollectionParam, validateRequestBody } from '../validators.js'

const portableDocument = z
  .object({
    identity: z
      .object({
        collection: z.string().min(1),
        slug: z
          .string()
          .min(1)
          .refine(
            (value) =>
              !value
                .split('/')
                .some((segment) => segment === '.' || segment === '..' || segment === '') &&
              !value.includes('\\'),
          ),
        locale: z.string().min(2),
      })
      .strict(),
    contract: z.record(z.string(), z.json()).nullable(),
    fields: z.record(z.string(), z.json()),
    metadata: z.record(z.string(), z.record(z.string(), z.json())),
    defaults: z.array(z.json()),
    body: z.string(),
    basis: z
      .object({ checksum: z.string().min(1), version: z.number().int().positive() })
      .strict()
      .optional(),
  })
  .strict()

/** Reviewed imports use document saves; no implicit publication or destructive deletion. */
export const importContent: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied
  const checked = validateCollectionParam(req.params['collection'], ctx)
  if (!checked.isValid) return checked.response
  const body = validateRequestBody(req.body)
  if (!body.isValid) return body.response
  const items = body.body['items']
  if (!Array.isArray(items) || items.length === 0)
    return { status: 400, body: { error: 'Request body must include a non-empty "items" array' } }
  const contract = await getActiveContract(checked.collectionDef, ctx.adapter)
  const results: Array<{
    slug: string
    imported: boolean
    unchanged?: boolean
    error?: string
    status?: number
    details?: unknown
  }> = []
  for (const raw of items) {
    const envelope = portableDocument.safeParse(raw)
    if (!envelope.success) {
      results.push({
        slug: '(unknown)',
        imported: false,
        status: 422,
        error: 'Invalid portable document',
        details: formatZodErrors(envelope.error.issues),
      })
      continue
    }
    const item = envelope.data as unknown as RepositoryDocument
    const slug = item.identity?.slug
    const locale = item.identity?.locale
    if (
      typeof slug !== 'string' ||
      typeof locale !== 'string' ||
      item.identity.collection !== checked.collection
    ) {
      results.push({
        slug: slug ?? '(unknown)',
        imported: false,
        error: 'Document identity must name this collection, a slug and a locale',
      })
      continue
    }
    if (!contractReferenceMatches(item.contract, contract)) {
      results.push({
        slug,
        imported: false,
        error:
          'The exported contract differs from the active contract. Review its fields and metadata before importing.',
      })
      continue
    }
    const parsed = parseRepositoryContent(
      checked.collectionDef,
      slug,
      {
        ...item.fields,
        identity: item.identity,
        contract: item.contract,
        metadata: item.metadata,
        defaults: item.defaults,
      },
      item.body,
      checked.collectionDef.schema,
      contract,
    )
    if (!parsed.success) {
      results.push({
        slug,
        imported: false,
        status: 422,
        error: 'Document validation failed',
        details: formatZodErrors(parsed.error.issues),
      })
      continue
    }
    const read = canGetContent(ctx.adapter)
      ? await ctx.adapter.getContent(checked.collection, slug, locale)
      : null
    const current = read?.meta.locale === locale ? read : null
    const values = parsed.data
    if (current && documentChecksum(current) === documentChecksum(values)) {
      results.push({ slug, imported: false, unchanged: true })
      continue
    }
    if (current && (!item.basis || item.basis.checksum !== documentChecksum(current))) {
      results.push({
        slug,
        imported: false,
        status: 409,
        error: 'Repository and database changes need an explicit review',
        details: { currentVersion: current.meta.version },
      })
      continue
    }
    const saved = await saveDocument(ctx, {
      collection: checked.collection,
      slug,
      locale,
      fields: values.fields,
      body: values.body,
      metadata: values.metadata,
      defaults: values.defaults,
      repositoryBasis: { checksum: documentChecksum(values), version: 0 },
      isNew: !current,
      expectedVersion: current?.meta.version,
      changedBy: changedByFromAuth(ctx.auth),
    })
    results.push(
      saved.ok
        ? { slug, imported: true }
        : {
            slug,
            imported: false,
            status: saved.response.status,
            error: String(
              (saved.response.body as { error?: string }).error ?? 'Document save failed',
            ),
            details: saved.response.body,
          },
    )
  }
  return {
    status: 200,
    body: {
      collection: checked.collection,
      imported: results.filter((r) => r.imported).length,
      total: items.length,
      results,
    },
  }
}
