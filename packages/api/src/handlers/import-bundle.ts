import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { validateRequestBody } from '../validators.js'
import { importContent } from './import-content.js'

/** A bundle contains portable documents; each uses the reviewed document import path. */
export const importBundle: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied
  const body = validateRequestBody(req.body)
  if (!body.isValid) return body.response
  const content = body.body.content
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { status: 400, body: { error: 'Bundle must contain a content object' } }
  }
  const entries = Object.entries(content)
  if (entries.some(([, items]) => !Array.isArray(items))) {
    return {
      status: 400,
      body: { error: 'Each collection must contain an array of portable documents' },
    }
  }
  if (ctx.checkpointAdapter) {
    await ctx.checkpointAdapter.createCheckpoint('pre-bundle-import', 'pre-import')
  }
  const results: Array<{ collection: string; status: number; result: unknown }> = []
  let imported = 0
  let skipped = 0
  const errors: Array<{ collection: string; slug: string; error: string }> = []
  for (const [collection, items] of entries) {
    const response = await importContent({ ...req, params: { collection }, body: { items } }, ctx)
    const result = response.body as {
      imported?: number
      error?: string
      results?: Array<{ slug: string; unchanged?: boolean; error?: string }>
    }
    if (response.status >= 400)
      errors.push({ collection, slug: '', error: result.error ?? 'Collection import failed' })
    for (const item of result.results ?? []) {
      if (item.unchanged) skipped++
      if (item.error) errors.push({ collection, slug: item.slug, error: item.error })
    }
    imported += result.imported ?? 0
    results.push({ collection, status: response.status, result: response.body })
  }
  return {
    status: 200,
    body: {
      imported,
      skipped,
      errors,
      results,
      checkpoint: ctx.checkpointAdapter ? 'created' : 'unavailable',
    },
  }
}
