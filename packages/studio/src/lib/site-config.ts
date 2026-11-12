import { fetchSiteConfig } from './api.js'
import type { SiteConfigResponse } from './api-types.js'

let loading: Promise<SiteConfigResponse | null> | null = null

/** The site's public configuration, fetched once per Studio session; null when it cannot be read */
export function loadSiteConfig(): Promise<SiteConfigResponse | null> {
  loading ??= fetchSiteConfig().catch(() => {
    loading = null
    return null
  })
  return loading
}
