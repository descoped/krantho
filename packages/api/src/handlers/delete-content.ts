import { deleteDocument } from '../document-actions.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { requireParam, validateCollectionParam } from '../validators.js'

/** DELETE /api/content/:collection/:slug */
export const deleteContent: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response

  return deleteDocument(
    ctx,
    { collection: validated.collection, slug: slugResult.value, locale: undefined },
    undefined,
  )
}
