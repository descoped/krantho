import { validateAllContent } from '@krantho/schema'
import type { ApiHandler } from '../types.js'

/** POST /api/validate — validate all content against schemas */
export const validateAll: ApiHandler = async (_req, ctx) => {
  const result = await validateAllContent(ctx.contentConfig, ctx.adapter, { mode: 'warn' })

  return {
    status: result.valid ? 200 : 422,
    body: {
      valid: result.valid,
      summary: result.summary,
      errors: result.errors,
    },
  }
}
