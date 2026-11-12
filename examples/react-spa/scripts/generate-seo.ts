/**
 * Build-time SEO generator — creates static SEO files in public/.
 * Run before vite build: tsx scripts/generate-seo.ts
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT_SEO = join(process.cwd(), '..', 'content', 'seo')
const PUBLIC = join(process.cwd(), 'public')

// Load site config
const siteConfig = JSON.parse(readFileSync(join(CONTENT_SEO, 'site-config.json'), 'utf-8'))
const domain = siteConfig.domain as string
const routes = siteConfig.appRoutes as string[]
const baseUrl = `https://${domain}`

// Generate sitemap.xml
const date = new Date().toISOString().split('T')[0]
const urls = routes
  .map((r: string) => `  <url>\n    <loc>${baseUrl}${r}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`)
  .join('\n')
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
writeFileSync(join(PUBLIC, 'sitemap.xml'), sitemap)
console.log('[SEO] sitemap.xml generated')

// Generate robots.txt
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`
writeFileSync(join(PUBLIC, 'robots.txt'), robots)
console.log('[SEO] robots.txt generated')

// Copy llms.txt if it exists
const llmsPath = join(CONTENT_SEO, 'generated', 'llms.txt')
if (existsSync(llmsPath)) {
  copyFileSync(llmsPath, join(PUBLIC, 'llms.txt'))
  console.log('[SEO] llms.txt copied')
} else {
  console.warn('[SEO] llms.txt not found — run seo:generate first')
}

console.log('[SEO] Static SEO files generated in public/')
