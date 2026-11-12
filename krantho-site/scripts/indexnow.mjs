// Submit every page of the deployed sitemap to IndexNow (Bing and the other
// participating engines). Run by the production deploy after the warm-up; the
// log lists every URL submitted and IndexNow's answer.
//
// Usage: node scripts/indexnow.mjs <site url>
import { describeSubmission, submitIndexNow } from '@krantho/server'
import config from '../krantho.config.ts'

const siteUrl = process.argv[2]
const key = config.seo?.indexNow?.key
const baseUrl = config.site?.baseUrl
if (!siteUrl || !key || !baseUrl) {
  console.error('usage: node scripts/indexnow.mjs <site url> (with seo.indexNow.key and site.baseUrl set)')
  process.exit(1)
}

/** The text of an XML element, with the entities XML escapes decoded */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescapeXml = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name])

// IndexNow fetches this file to confirm the site owns the key: check it first
const keyLocation = `${new URL(baseUrl).origin}/${key}.txt`
const keyFile = await fetch(keyLocation)
const served = keyFile.ok ? (await keyFile.text()).trim() : ''
if (served !== key) throw new Error(`${keyLocation} answered HTTP ${keyFile.status} without the key`)
console.log(`Key file ${keyLocation}: HTTP ${keyFile.status}, serves the key`)

const sitemap = await fetch(`${siteUrl}/sitemap.xml`)
if (!sitemap.ok) throw new Error(`sitemap.xml answered HTTP ${sitemap.status}`)
const xml = await sitemap.text()
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => unescapeXml(match[1]))
if (urls.length === 0) throw new Error('sitemap.xml lists no pages')

const statuses = await submitIndexNow({ baseUrl, key }, urls)
console.log(describeSubmission(urls, statuses))
