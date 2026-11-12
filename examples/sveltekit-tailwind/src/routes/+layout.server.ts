import { resolveConfig } from '@krantho/config'
import { loadContent } from '$lib/cms'
import { loadSeoJson } from '$lib/seo'
import config from '../../krantho.config'

const { site } = resolveConfig(config, process.env)

export async function load() {
  const nav = await loadContent('globals', 'navigation')
  const footer = await loadContent('globals', 'footer')
  const contactInfo = await loadContent('globals', 'contact-info')
  const structuredData = loadSeoJson<Record<string, Record<string, unknown>>>('structured-data.json')
  return {
    nav: nav?.fields ?? {},
    footer: footer?.fields ?? {},
    contactInfo: contactInfo?.fields ?? {},
    structuredData,
    siteUrl: site.baseUrl,
  }
}
