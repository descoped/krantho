import { defineKranthoConfig } from '@krantho/config'

/**
 * Site configuration — data only. Every value here can be overridden from the
 * environment; see `docs/configuration.md` for the variable behind each leaf.
 * Collections live in `krantho.collections.ts`; the API is wiring and lives in
 * `server.ts`. Media files go to the store named by `media.provider`.
 */
export default defineKranthoConfig({
  site: {
    domain: 'localhost',
    name: 'Krantho Example',
    language: 'en',
    baseUrl: 'http://localhost:4005',
    supportedLocales: ['en', 'no'],
    defaultLocale: 'en',
  },
  media: {
    provider: 'local',
    local: { dir: 'public/uploads' },
    maxFileSize: 50 * 1024 * 1024,
  },
  seo: {
    configDir: './krantho.seo',
  },
  // Studio's assistant answers once an AI provider is set in Setup › AI provider
  assistant: { enabled: true },
  // `cache.pages` stays 'none' here: the CDN in front of a deployment is chosen
  // from its environment (KRANTHO_CACHE_PAGES, KRANTHO_CACHE_CDN_*) — see README.md.
})
