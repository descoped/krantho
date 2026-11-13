import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { buildSitemapUrls, serializeSitemapXml } from './seo-sitemap.js'

/** POST /api/seo/generate — regenerate SEO files that can be built without CLI tools */
export const seoGenerate: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'editor')
  if (denied) return denied

  const basePath = ctx.config.paths.seoGeneratedDir
  await mkdir(basePath, { recursive: true })

  const results: Record<string, string> = {}

  // The same sitemap the site serves at /sitemap.xml
  try {
    const xml = serializeSitemapXml(await buildSitemapUrls(ctx))
    await writeFile(join(basePath, 'sitemap.xml'), xml, 'utf-8')
    results.sitemap = 'generated'
  } catch {
    results.sitemap = 'failed'
  }

  // structured-data.json and faq-pages.json require @krantho/tools (CLI-only)
  results['structured-data'] = 'requires CLI: pnpm run seo:generate'
  results['faq-pages'] = 'requires CLI: pnpm run seo:generate'
  results['llms-txt'] = 'requires CLI: pnpm run seo:generate'

  return {
    status: 200,
    body: { results },
  }
}
