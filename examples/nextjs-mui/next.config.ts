import { resolveConfig } from '@krantho/config'
import type { NextConfig } from 'next'
import kranthoConfig from './krantho.config'

// With `cache.shared: 'database'` (KRANTHO_CACHE_SHARED=database) every instance
// of the site keeps Next's page cache in the site's own database and sees every
// invalidation. No instance keeps a private in-memory copy.
const sharedCache =
  resolveConfig(kranthoConfig, process.env).cache.shared === 'database'
    ? {
        cacheHandler: require.resolve('@krantho/server-next/cache-handler'),
        cacheMaxMemorySize: 0,
      }
    : {}

const nextConfig: NextConfig = {
  ...sharedCache,
  serverExternalPackages: [
    'better-sqlite3',
    '@krantho/server',
    '@krantho/server-next',
  ],
  experimental: {
    externalDir: true,
  },
  // Rewrite the standard /robots.txt and /sitemap.xml URLs to the @krantho/api
  // handlers, which derive them from the published content and the SEO config.
  async rewrites() {
    return [
      { source: '/robots.txt', destination: '/api/seo/robots.txt' },
      { source: '/sitemap.xml', destination: '/api/seo/sitemap' },
    ]
  },
}

export default nextConfig
