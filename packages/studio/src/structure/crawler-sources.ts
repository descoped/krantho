import {
  fetchLlmsTxt,
  fetchRobotsText,
  fetchSitemapJson,
  type LlmsTxtOrigin,
  type SitemapUrl,
} from '../lib/api.js'
import { fetchServed, type Served, servedOk } from '../lib/served.js'
import { parseSitemap, type SitemapEntry } from './crawlers-model.js'

/** The sitemap the site serves at `/sitemap.xml`; when it serves none, what krantho's API builds */
export interface SitemapRead {
  served: Served
  /** The served sitemap's URLs; null when what is served is not a sitemap */
  entries: SitemapEntry[] | null
  /** krantho's own list, read only when the site serves no sitemap */
  krantho: SitemapUrl[] | null
}

export interface CrawlerData {
  sitemap: SitemapRead
  robots: { served: Served; krantho: string }
  llms: { served: Served; krantho: { text: string; origin: LlmsTxtOrigin | null } | null }
}

async function readSitemap(): Promise<SitemapRead> {
  const served = await fetchServed('/sitemap.xml')
  if (servedOk(served)) return { served, entries: parseSitemap(served.text), krantho: null }
  const krantho = await fetchSitemapJson().then(
    (answer) => answer.urls,
    () => null,
  )
  return { served, entries: null, krantho }
}

/** What crawlers and assistants read at the site's addresses, and what krantho's API answers there */
export async function loadCrawlerData(): Promise<CrawlerData> {
  const [sitemap, robotsServed, robots, llmsServed, llms] = await Promise.all([
    readSitemap(),
    fetchServed('/robots.txt'),
    fetchRobotsText(),
    fetchServed('/llms.txt'),
    fetchLlmsTxt().catch(() => null),
  ])
  return {
    sitemap,
    robots: { served: robotsServed, krantho: robots },
    llms: { served: llmsServed, krantho: llms },
  }
}
