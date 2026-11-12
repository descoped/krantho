import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiHandler } from '../types.js'

interface FileStatus {
  exists: boolean
  entries?: number | undefined
  routes?: number | undefined
  bytes?: number | undefined
  urls?: number | undefined
}

async function checkJsonFile(
  filePath: string,
  countKey: 'entries' | 'routes',
): Promise<FileStatus> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    return { exists: false }
  }

  try {
    const data: unknown = JSON.parse(raw)
    let count = 0
    if (Array.isArray(data)) {
      count = data.length
    } else if (data && typeof data === 'object') {
      count = Object.keys(data).length
    }
    return { exists: true, [countKey]: count }
  } catch {
    // File exists but contains invalid JSON
    return { exists: true, [countKey]: 0 }
  }
}

async function checkTextFile(filePath: string): Promise<FileStatus> {
  try {
    const info = await stat(filePath)
    return { exists: true, bytes: info.size }
  } catch {
    return { exists: false }
  }
}

async function checkSitemapFile(filePath: string): Promise<FileStatus> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const urls = (raw.match(/<url>/g) ?? []).length
    return { exists: true, urls }
  } catch {
    return { exists: false }
  }
}

/** GET /api/seo/status — SEO file status overview */
export const seoStatus: ApiHandler = async (_req, ctx) => {
  const basePath = ctx.config.paths.seoGeneratedDir

  const [structuredData, faqPages, llmsTxt, sitemap, contentDates] = await Promise.all([
    checkJsonFile(join(basePath, 'structured-data.json'), 'entries'),
    checkJsonFile(join(basePath, 'faq-pages.json'), 'routes'),
    checkTextFile(join(basePath, 'llms.txt')),
    checkSitemapFile(join(basePath, 'sitemap.xml')),
    checkJsonFile(join(basePath, 'content-dates.json'), 'entries'),
  ])

  return {
    status: 200,
    body: { structuredData, faqPages, llmsTxt, sitemap, contentDates },
  }
}
