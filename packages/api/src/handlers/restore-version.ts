import { hasVersioning } from '@krantho/persistence'
import { lockedByOther } from '../content-locks.js'
import { changedByFromAuth, requireRole } from '../permissions.js'
import { saveDocument } from '../save-document.js'
import type { ApiHandler } from '../types.js'
import {
  parseLocaleParam,
  parsePositiveInt,
  requireParam,
  validateCollectionParam,
} from '../validators.js'

/** POST /api/content/:collection/:slug/restore/:version — restore a version */
export const restoreVersion: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  const slugResult = requireParam(req.params, 'slug')
  if (!slugResult.isValid) return slugResult.response
  const slug = slugResult.value

  const version = parsePositiveInt(req.params['version'])
  if (version === undefined || version < 1) {
    return { status: 400, body: { error: 'Invalid version number' } }
  }

  if (!hasVersioning(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support version restore' } }
  }

  const changedBy = changedByFromAuth(ctx.auth)
  const locale = parseLocaleParam(req.query['locale'])
  const locked = await lockedByOther(ctx, { collection: validated.collection, slug, locale })
  if (locked) return locked

  const snapshot = await ctx.adapter.getVersion(validated.collection, slug, version, locale)
  if (!snapshot)
    return { status: 404, body: { error: `Version ${version} not found for "${slug}"` } }
  const currentDocument = await ctx.adapter.getContent?.(validated.collection, slug, locale)
  const saved = await saveDocument(ctx, {
    collection: validated.collection,
    slug,
    locale,
    isNew: false,
    fields: snapshot.fields,
    metadata: snapshot.metadata,
    defaults: snapshot.defaults,
    body: snapshot.body,
    expectedVersion: currentDocument?.meta.version,
    changedBy,
  })
  if (!saved.ok)
    return {
      ...saved.response,
      body: {
        ...(saved.response.body as Record<string, unknown>),
        restoredVersion: version,
        message:
          'This snapshot needs changes before it can be saved. Prepare a draft to review them.',
      },
    }
  const current = saved.version
  const liveVersion = saved.liveVersion

  return {
    status: 200,
    body: {
      slug,
      collection: validated.collection,
      restoredVersion: version,
      version: current,
      liveVersion,
      message: 'Restored',
    },
  }
}
