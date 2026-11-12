import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Requests that arrive on the old documentation host
const DOCS_HOST = { type: 'host' as const, value: 'docs.krantho.com' }

const nextConfig: NextConfig = {
  serverExternalPackages: ['@krantho/server', '@krantho/server-next'],
  // Trace from the workspace root so deployed functions carry the linked
  // workspace packages, then add what tracing cannot see: the content any route
  // imports on first boot (collection directories are built from cwd), the
  // Studio SPA the Studio route serves, and libvips, which sharp's native binding
  // loads by its library path rather than by require (media image variants).
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  outputFileTracingIncludes: {
    '/**': ['./content/**/*', './krantho.seo/**/*'],
    '/studio/**': ['../packages/studio/dist/**/*'],
    '/api/**': [
      '../node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*',
    ],
  },
  // Serve the standard /robots.txt and /sitemap.xml URLs from the @krantho/api
  // handlers, which derive them from the collections and the SEO config.
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
      // The IndexNow key file, /<seo.indexNow.key>.txt
      { source: '/:key([a-zA-Z0-9-]+).txt', destination: '/api/seo/indexnow/:key' },
    ]
  },
  // The documentation moved from docs.krantho.com (Astro Starlight, nested
  // sections) to krantho.com/docs (flat slugs; package pages are package-<name>).
  // Old links keep working, on either host.
  async redirects() {
    return [
      { source: '/docs/getting-started/:slug', destination: '/docs/:slug', permanent: true },
      { source: '/docs/guides/:slug', destination: '/docs/:slug', permanent: true },
      { source: '/docs/reference/:slug', destination: '/docs/:slug', permanent: true },
      { source: '/docs/packages/:name', destination: '/docs/package-:name', permanent: true },
      // Releases had pages of their own; each is now an entry on the one changelog page
      { source: '/changelog/:slug', destination: '/changelog#:slug', permanent: true },
      { source: '/', has: [DOCS_HOST], destination: 'https://krantho.com/docs', permanent: true },
      { source: '/getting-started/:slug', has: [DOCS_HOST], destination: 'https://krantho.com/docs/:slug', permanent: true },
      { source: '/guides/:slug', has: [DOCS_HOST], destination: 'https://krantho.com/docs/:slug', permanent: true },
      { source: '/reference/:slug', has: [DOCS_HOST], destination: 'https://krantho.com/docs/:slug', permanent: true },
      { source: '/packages/:name', has: [DOCS_HOST], destination: 'https://krantho.com/docs/package-:name', permanent: true },
    ]
  },
}

export default nextConfig
