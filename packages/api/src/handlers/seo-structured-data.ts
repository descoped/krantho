import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiHandler } from '../types.js'

/** GET /api/seo/structured-data — return generated structured-data.json */
export const seoStructuredData: ApiHandler = async (_req, ctx) => {
  const basePath = ctx.config.paths.seoGeneratedDir

  try {
    const raw = await readFile(join(basePath, 'structured-data.json'), 'utf-8')
    const data: unknown = JSON.parse(raw)
    return { status: 200, body: data }
  } catch {
    return {
      status: 404,
      body: { error: 'structured-data.json not found — run seo:generate to create it' },
    }
  }
}
