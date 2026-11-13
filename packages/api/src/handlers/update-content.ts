import { z } from 'zod'
import { changedByFromAuth, requireRole } from '../permissions.js'
import { saveDocument } from '../save-document.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam, validateRequestBody, validateSlugParam } from '../validators.js'

/** PUT /api/content/:collection/:slug — update + validate (editor+) */
export const updateContent: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params.collection, ctx)
  if (!validated.isValid) return validated.response

  const slugCheck = validateSlugParam(req.params.slug)
  if (!slugCheck.isValid) return slugCheck.response
  const slug = slugCheck.slug

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  // A body key that is present — even as "" — means "replace the body"
  // (empty erases it); an absent key means fields-only update. Truthiness
  // would misread an empty body as absent.
  const bodyValue = bodyCheck.body.body
  const locale = typeof bodyCheck.body.locale === 'string' ? bodyCheck.body.locale : undefined
  const submittedVersion =
    typeof bodyCheck.body._version === 'number' ? bodyCheck.body._version : undefined

  const defaults = z
    .array(
      z
        .object({
          collection: z.string().min(1),
          slug: z.string().min(1),
          locale: z.string().min(2),
          version: z.number().int().positive(),
          paths: z.array(z.string()),
          values: z.record(z.string(), z.json()),
        })
        .strict(),
    )
    .optional()
    .safeParse(bodyCheck.body.defaults)
  if (!defaults.success)
    return { status: 422, body: { error: 'Invalid shared default provenance' } }

  const saved = await saveDocument(ctx, {
    collection: validated.collection,
    slug,
    fields: (bodyCheck.body.fields ?? {}) as Record<string, unknown>,
    body: typeof bodyValue === 'string' ? bodyValue : undefined,
    locale,
    isNew: false,
    expectedVersion: submittedVersion,
    changedBy: changedByFromAuth(ctx.auth),
    metadata: bodyCheck.body.metadata,
    defaults: defaults.data,
  })
  if (!saved.ok) return saved.response

  return {
    status: 200,
    body: {
      slug,
      collection: validated.collection,
      version: saved.version,
      liveVersion: saved.liveVersion,
      message: 'Updated',
    },
  }
}
