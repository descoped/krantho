import { canWriteContent } from '@krantho/persistence'
import { changedByFromAuth, requireRole } from '../permissions.js'
import { saveDocument } from '../save-document.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam, validateRequestBody } from '../validators.js'

/** POST /api/content/:collection — create + validate (editor+) */
export const createContent: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  if (!canWriteContent(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support writeContent' } }
  }

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const slug = typeof bodyCheck.body['slug'] === 'string' ? bodyCheck.body['slug'] : undefined
  const fields = (bodyCheck.body['fields'] ?? {}) as Record<string, unknown>
  const content = typeof bodyCheck.body['body'] === 'string' ? bodyCheck.body['body'] : ''
  const locale = typeof bodyCheck.body['locale'] === 'string' ? bodyCheck.body['locale'] : undefined

  if (!slug) {
    return { status: 400, body: { error: 'Missing "slug" in request body' } }
  }

  const saved = await saveDocument(ctx, {
    collection: validated.collection,
    slug,
    fields,
    body: content,
    locale,
    isNew: true,
    changedBy: changedByFromAuth(ctx.auth),
    metadata: bodyCheck.body['metadata'],
  })
  if (!saved.ok) return saved.response

  return {
    status: 201,
    body: {
      slug: saved.slug,
      collection: validated.collection,
      version: saved.version,
      liveVersion: saved.liveVersion,
      message: 'Created',
    },
  }
}
