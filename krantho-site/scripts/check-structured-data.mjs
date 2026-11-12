// Check the structured data of every page of a deployed site: fetch each page
// the sitemap lists, take the JSON-LD from the page source and validate it
// against Schema.org and the site's readers (`seo.readers`, as `krantho.config.ts`
// and `KRANTHO_SEO_READERS` set them). Exits non-zero on errors; warnings are
// reported. It reads what search engines read and needs no credentials. Run by
// the production deploy after the warm-up; it runs against any site:
//
// Usage: node scripts/check-structured-data.mjs <site url>
import { resolveConfig } from '@krantho/config'
import { validateGraph } from '@krantho/seo'
import config from '../krantho.config.ts'
import { checkSite, formatReport } from './structured-data.mjs'

const siteUrl = process.argv[2]
if (!siteUrl) {
  console.error('usage: node scripts/check-structured-data.mjs <site url>')
  process.exit(1)
}

const { readers } = resolveConfig(config, process.env).seo
const validate = (graph) => validateGraph(graph, { profiles: readers })

console.log(
  `Checking the structured data of ${siteUrl} against Schema.org and ${readers.join(', ')}`,
)
const result = await checkSite({ baseUrl: siteUrl, validate })
console.log(formatReport(result))
if (result.errors > 0) process.exit(1)
