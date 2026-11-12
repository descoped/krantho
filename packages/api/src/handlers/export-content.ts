import { canQuery, repositoryDocument, repositoryMarkdown } from '@krantho/persistence'
import { documentChecksum } from '@krantho/schema'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { parseLocaleParam, validateCollectionParam } from '../validators.js'

/**
 * GET /api/content/:collection/export?format=json|markdown&locale=en&state=current|published —
 * export a collection. The published state is public; the current state, with its drafts, needs an editor.
 */
export const exportContent: ApiHandler = async (req, ctx) => {
  const validated = validateCollectionParam(req.params['collection'], ctx)
  if (!validated.isValid) return validated.response

  if (!canQuery(ctx.adapter)) {
    return { status: 501, body: { error: 'Adapter does not support query' } }
  }

  const format = req.query['format'] === 'markdown' ? 'markdown' : 'json'
  const locale = parseLocaleParam(req.query['locale'])

  const state = req.query['state'] ?? 'current'
  if (state !== 'current' && state !== 'published')
    return { status: 400, body: { error: 'State must be current or published' } }
  // The current state holds drafts: published content is what visitors read, drafts are for editors
  if (state === 'current') {
    const denied = requireRole(ctx.auth, 'editor')
    if (denied) return denied
  }
  const { items } = await ctx.adapter.query({
    state,
    projection: 'full',
    collections: [validated.collection],
    locale,
  })
  const exported = items.map((item) => repositoryDocument(item, documentChecksum(item)))

  if (format === 'markdown') {
    if (new Set(exported.map((item) => item.identity.slug)).size !== exported.length) {
      return {
        status: 409,
        body: {
          error:
            'Markdown filenames would collide across locales. Export one locale at a time, or use JSON.',
        },
      }
    }
    const files: Array<{ slug: string; content: string }> = []
    for (const item of exported) {
      files.push({ slug: item.identity.slug, content: repositoryMarkdown(item) })
    }
    return {
      status: 200,
      body: {
        collection: validated.collection,
        format: 'markdown',
        state,
        count: files.length,
        files,
      },
    }
  }

  return {
    status: 200,
    body: {
      collection: validated.collection,
      format: 'json',
      state,
      count: exported.length,
      items: exported,
    },
  }
}
